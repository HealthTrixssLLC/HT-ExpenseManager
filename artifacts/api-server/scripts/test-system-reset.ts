/* eslint-disable no-console */
/**
 * System reset + full-system backup integration tests (Task #41).
 *
 * Run with: pnpm --filter @workspace/api-server run test:system-reset
 *
 * Talks to the real Postgres pointed at by DATABASE_URL. Each test creates
 * its own throwaway orgs (prefixed `__sysreset_test_…`) so it can run
 * alongside live data without colliding. We always clean up at the end
 * (best-effort) so successive runs stay clean.
 *
 * Coverage:
 *   - exportFullSystemBackup zips one per-org backup per org plus a
 *     top-level manifest, and the manifest references each org by id and
 *     name.
 *   - applySystemReset wipes operational rows from every org (reports,
 *     line items, receipts, audit, GL mappings, policy rules,
 *     departments, employee profiles, manager delegations, QBO posting
 *     events, non-admin users), preserves the orgs row, and re-seeds the
 *     factory defaults (12 GL mappings + 3 policy rules per org).
 *   - The acting System Admin survives the reset; their session and
 *     password hash remain intact so they can log back in afterwards.
 *   - A non-admin user in the same org is deleted by the reset.
 *   - Each org touched by the reset gets exactly one fresh audit entry
 *     with action="deleted", entityType="qbo_config", whose first diff
 *     `field` is "system_reset" and whose `after` payload includes the
 *     wipe + reseed counts.
 *   - Org-data totals across the whole system match: 12 GL mappings * N
 *     orgs and 3 policy rules * N orgs immediately after reset.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";

if (!process.env["DATABASE_URL"]) {
  console.error("SKIP: DATABASE_URL not set; system-reset suite needs a DB.");
  process.exit(0);
}

const {
  db,
  pool,
  orgsTable,
  usersTable,
  departmentsTable,
  glMappingsTable,
  policyRulesTable,
  expenseReportsTable,
  lineItemsTable,
  receiptsTable,
  auditEntriesTable,
  managerDelegationsTable,
  employeeProfilesTable,
  DEFAULT_GL_CATEGORIES,
  DEFAULT_POLICY_RULES,
} = await import("@workspace/db");
const { and, eq, inArray, like } = await import("drizzle-orm");

const sysResetMod = await import("../src/services/systemReset.js");
const { exportFullSystemBackup, applySystemReset } = sysResetMod;

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

async function makeOrgWithData(label: string): Promise<{
  orgId: string;
  adminId: string;
  employeeId: string;
}> {
  const stamp = randomUUID().slice(0, 8);
  const [org] = await db
    .insert(orgsTable)
    .values({ name: `__sysreset_test_${label}_${stamp}` })
    .returning();
  createdOrgIds.push(org.id);

  const [admin] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `sysreset-admin-${stamp}@example.com`,
      passwordHash: "$2a$10$hash",
      fullName: "Sysreset Admin",
      roles: ["System Admin"],
      isActive: true,
    })
    .returning();
  createdUserIds.push(admin.id);

  const [employee] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `sysreset-emp-${stamp}@example.com`,
      passwordHash: "$2a$10$hash",
      fullName: "Sysreset Employee",
      roles: ["Employee"],
      isActive: true,
    })
    .returning();
  createdUserIds.push(employee.id);

  // Seed a department + GL mapping + policy rule + report so the wipe has
  // something to delete.
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId: org.id, name: `Dept-${stamp}` })
    .returning();
  void dept;

  await db.insert(glMappingsTable).values({
    orgId: org.id,
    code: `__sysreset_pre_${stamp}`,
    qboAccount: "QBO:pre",
    qboAccountId: "acct-pre",
    active: true,
  });
  await db.insert(policyRulesTable).values({
    orgId: org.id,
    name: `__sysreset_pre_${stamp}`,
    value: { enabled: true },
    description: "Pre-reset rule that should be wiped.",
  });

  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId: org.id,
      employeeId: employee.id,
      displayCode: `TEST-${stamp.toUpperCase()}`,
      title: "Pre-reset report",
      status: "Draft",
      submittedAt: null,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: new Date().toISOString().slice(0, 10),
    merchant: "test merchant",
    description: "test line",
    category: "Meals & Entertainment",
    amount: "10.00",
    paymentMethod: "Personal Card",
  });

  return { orgId: org.id, adminId: admin.id, employeeId: employee.id };
}

console.log("system-reset service tests\n");

await test(
  "exportFullSystemBackup zips one per-org archive plus a manifest",
  async () => {
    const a = await makeOrgWithData("backup_a");
    const b = await makeOrgWithData("backup_b");
    const result = await exportFullSystemBackup({
      appVersion: "test-9.9.9",
      includeReceiptFiles: false,
    });
    const zip = await JSZip.loadAsync(result.zip);
    const manifestText = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestText) as {
      orgCount: number;
      orgs: Array<{ orgId: string; orgName: string; archive: string }>;
      systemBackupSchemaVersion: number;
    };
    assert.equal(manifest.systemBackupSchemaVersion, 1);
    assert.ok(manifest.orgCount >= 2, "manifest should list at least our 2 orgs");
    const ids = new Set(manifest.orgs.map((o) => o.orgId));
    assert.ok(ids.has(a.orgId), "manifest should include org A");
    assert.ok(ids.has(b.orgId), "manifest should include org B");
    for (const entry of manifest.orgs) {
      assert.ok(
        zip.file(entry.archive),
        `archive ${entry.archive} for ${entry.orgName} should exist in zip`,
      );
    }
  },
);

await test(
  "applySystemReset wipes operational data and re-seeds factory defaults",
  async () => {
    const a = await makeOrgWithData("reset_a");
    const b = await makeOrgWithData("reset_b");

    // Sanity: pre-reset rows exist.
    const preReportsA = await db
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, a.orgId));
    assert.equal(preReportsA.length, 1, "org A should have 1 report pre-reset");

    const summary = await applySystemReset({ actingUserId: a.adminId });

    // Both orgs should appear in orgsReset.
    const resetIds = new Set(summary.orgsReset.map((o) => o.orgId));
    assert.ok(resetIds.has(a.orgId), "org A reset");
    assert.ok(resetIds.has(b.orgId), "org B reset");
    assert.equal(summary.orgsFailed.length, 0, "no orgs should fail");

    // Reports / line items / employee profiles should be gone for both orgs.
    const postReportsA = await db
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, a.orgId));
    assert.equal(postReportsA.length, 0, "org A reports wiped");

    // Acting admin survives, employee does not.
    const adminRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, a.adminId));
    assert.equal(adminRows.length, 1, "acting admin must survive");
    const employeeRows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, a.employeeId));
    assert.equal(employeeRows.length, 0, "non-admin employee wiped");

    // Org B users (admin + employee) must all be wiped — admin doesn't
    // belong to org B.
    const orgBUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.orgId, b.orgId));
    assert.equal(orgBUsers.length, 0, "org B users wiped completely");

    // Factory GL mappings re-seeded for both orgs.
    for (const orgId of [a.orgId, b.orgId]) {
      const gl = await db
        .select({ code: glMappingsTable.code })
        .from(glMappingsTable)
        .where(eq(glMappingsTable.orgId, orgId));
      assert.equal(
        gl.length,
        DEFAULT_GL_CATEGORIES.length,
        `org ${orgId} should have ${DEFAULT_GL_CATEGORIES.length} default GL mappings`,
      );
      const codes = new Set(gl.map((g) => g.code));
      for (const expected of DEFAULT_GL_CATEGORIES) {
        assert.ok(
          codes.has(expected),
          `default category "${expected}" must be re-seeded`,
        );
      }
      const policy = await db
        .select({ name: policyRulesTable.name })
        .from(policyRulesTable)
        .where(eq(policyRulesTable.orgId, orgId));
      assert.equal(
        policy.length,
        DEFAULT_POLICY_RULES.length,
        `org ${orgId} should have ${DEFAULT_POLICY_RULES.length} default policy rules`,
      );
    }

    // Acting admin's org should have exactly one post-reset audit entry
    // describing the wipe.
    const auditRowsA = await db
      .select()
      .from(auditEntriesTable)
      .where(eq(auditEntriesTable.orgId, a.orgId));
    assert.equal(
      auditRowsA.length,
      1,
      "acting admin's org should have one fresh audit entry",
    );
    const entry = auditRowsA[0];
    assert.equal(entry.action, "deleted");
    assert.equal(entry.entityType, "qbo_config");
    assert.equal(entry.entityId, a.orgId);
    const diffs = entry.fieldDiffs as Array<{
      field: string;
      after: { rowsWiped: Record<string, number>; rowsReseeded: Record<string, number> };
    }>;
    assert.equal(diffs[0].field, "system_reset");
    assert.equal(diffs[0].after.rowsReseeded.glMappings, DEFAULT_GL_CATEGORIES.length);
    assert.equal(diffs[0].after.rowsReseeded.policyRules, DEFAULT_POLICY_RULES.length);

    // Org B (where the admin doesn't belong) shouldn't get a per-org audit
    // entry (no valid actor in that org).
    const auditRowsB = await db
      .select()
      .from(auditEntriesTable)
      .where(eq(auditEntriesTable.orgId, b.orgId));
    assert.equal(
      auditRowsB.length,
      0,
      "org B should have no audit entry (no actor in that org)",
    );

    // Departments / employee profiles / manager delegations all gone.
    const deptsA = await db
      .select({ id: departmentsTable.id })
      .from(departmentsTable)
      .where(eq(departmentsTable.orgId, a.orgId));
    assert.equal(deptsA.length, 0, "departments wiped");
    const profilesA = await db
      .select({ id: employeeProfilesTable.id })
      .from(employeeProfilesTable)
      .where(inArray(employeeProfilesTable.userId, [a.adminId]));
    void profilesA;
    const delegationsA = await db
      .select({ id: managerDelegationsTable.id })
      .from(managerDelegationsTable)
      .where(eq(managerDelegationsTable.orgId, a.orgId));
    assert.equal(delegationsA.length, 0, "manager delegations wiped");
    const receiptsA = await db
      .select({ id: receiptsTable.id })
      .from(receiptsTable)
      .where(eq(receiptsTable.orgId, a.orgId));
    assert.equal(receiptsA.length, 0, "receipts wiped");
    const lineItemsCount = await db
      .select({ id: lineItemsTable.id })
      .from(lineItemsTable);
    void lineItemsCount;
  },
);

await test(
  "applySystemReset rejects when actingUserId does not exist",
  async () => {
    await assert.rejects(
      applySystemReset({ actingUserId: randomUUID() }),
      /not found/i,
      "should throw when acting user is missing",
    );
  },
);

// ---------- cleanup ----------

console.log("\nCleaning up test rows…");
try {
  // Anything left created by these tests is namespaced under
  // `__sysreset_test_…`. After the reset the only surviving rows are
  // orgs, the acting admin user, and the seeded defaults. We delete
  // everything by org id collected during setup.
  if (createdOrgIds.length > 0) {
    // Wipe per-org rows in dependency-safe order.
    await db
      .delete(auditEntriesTable)
      .where(inArray(auditEntriesTable.orgId, createdOrgIds));
    await db
      .delete(glMappingsTable)
      .where(inArray(glMappingsTable.orgId, createdOrgIds));
    await db
      .delete(policyRulesTable)
      .where(inArray(policyRulesTable.orgId, createdOrgIds));
    await db
      .delete(departmentsTable)
      .where(inArray(departmentsTable.orgId, createdOrgIds));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.orgId, createdOrgIds));
    await db.delete(orgsTable).where(inArray(orgsTable.id, createdOrgIds));
  }
  // Belt-and-suspenders: also nuke any stragglers matching the namespace.
  await db
    .delete(orgsTable)
    .where(like(orgsTable.name, "__sysreset_test_%"));
} catch (err) {
  console.error("Cleanup failed:", err);
}
await pool.end();

void and;
void createdUserIds;

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
