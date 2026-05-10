/* eslint-disable no-console */
/**
 * Tag-edit authorization tests (Task #63).
 *
 * Run with: pnpm --filter @workspace/api-server run test:tag-permissions
 *
 * Talks to the real Postgres pointed at by DATABASE_URL. Each test creates
 * its own throwaway org (prefixed `__tagperm_test_…`) and best-effort
 * cleans up at the end so successive runs stay clean.
 *
 * Coverage of the bug from Task #63:
 *   - A user who is BOTH the report owner AND holds an admin role can
 *     edit tags through every owner-side content-editable status:
 *     Draft, Submitted, Manager Review, Changes Requested, Manager
 *     Approved, Finance Review.
 *   - That same user is still locked out of tags on terminal /
 *     post-finance statuses: Voided, Reconciled, Rejected.
 *   - Regression: a finance/admin user who is NOT the owner is still
 *     blocked on Draft (outside the finance window) but allowed on
 *     Manager Approved (inside the finance window).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

if (!process.env["DATABASE_URL"]) {
  console.error("SKIP: DATABASE_URL not set; tag-permissions suite needs a DB.");
  process.exit(0);
}

import type { User, ExpenseReport } from "@workspace/db";
const {
  db,
  pool,
  orgsTable,
  usersTable,
  expenseReportsTable,
} = await import("@workspace/db");
const { inArray, like } = await import("drizzle-orm");
const { canEditReportTags } = await import("../src/lib/reports.js");

const createdOrgIds: string[] = [];
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

type WorkflowStatus = ExpenseReport["status"];

async function makeOrg(label: string): Promise<{
  orgId: string;
  ownerAdmin: User;
  financeNonOwner: User;
  managerFinanceNonOwner: User;
}> {
  const stamp = randomUUID().slice(0, 8);
  const [org] = await db
    .insert(orgsTable)
    .values({ name: `__tagperm_test_${label}_${stamp}` })
    .returning();
  createdOrgIds.push(org.id);

  // Manager+finance lives at the top of the chain so we can wire it
  // up as the owner's direct manager below.
  const [managerFinanceNonOwner] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `tagperm-mgrfin-${stamp}@example.com`,
      passwordHash: "$2a$10$hash",
      fullName: "Manager+Finance Non-owner",
      roles: ["Manager Approver", "Finance Approver"],
      isActive: true,
    })
    .returning();

  const [ownerAdmin] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `tagperm-owner-${stamp}@example.com`,
      passwordHash: "$2a$10$hash",
      fullName: "Owner Admin",
      // Both Employee and an admin role — the exact combo that triggered
      // the bug.
      roles: ["Employee", "System Admin"],
      managerId: managerFinanceNonOwner.id,
      isActive: true,
    })
    .returning();

  const [financeNonOwner] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `tagperm-finance-${stamp}@example.com`,
      passwordHash: "$2a$10$hash",
      fullName: "Finance Non-owner",
      roles: ["Finance Approver"],
      isActive: true,
    })
    .returning();

  return { orgId: org.id, ownerAdmin, financeNonOwner, managerFinanceNonOwner };
}

async function makeReport(
  orgId: string,
  ownerId: string,
  status: WorkflowStatus,
): Promise<ExpenseReport> {
  const stamp = randomUUID().slice(0, 8);
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId,
      employeeId: ownerId,
      displayCode: `TAG-${stamp.toUpperCase()}`,
      title: `Tag-perm report (${status})`,
      status,
      submittedAt: status === "Draft" ? null : new Date(),
    })
    .returning();
  return report;
}

console.log("tag-edit authorization tests\n");

const OWNER_EDITABLE_STATUSES: WorkflowStatus[] = [
  "Draft",
  "Submitted",
  "Manager Review",
  "Changes Requested",
  "Manager Approved",
  "Finance Review",
];

const OWNER_LOCKED_STATUSES: WorkflowStatus[] = [
  // Terminal / post-finance statuses the owner is locked out of.
  "Voided",
  "Reconciled",
  "Rejected",
  // Finance-only statuses must NOT be unlocked for the owner just
  // because they also hold an admin role.
  "Finance Approved",
  "Posted to QuickBooks",
  "Ready for Payroll Reimbursement",
  "Sync Error",
];

const ctx = await makeOrg("primary");

for (const status of OWNER_EDITABLE_STATUSES) {
  await test(
    `owner+admin can edit tags on a "${status}" report`,
    async () => {
      const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, status);
      const result = await canEditReportTags(report, ctx.ownerAdmin);
      assert.equal(
        result.ok,
        true,
        `expected ok=true for ${status}, got ${JSON.stringify(result)}`,
      );
    },
  );
}

for (const status of OWNER_LOCKED_STATUSES) {
  await test(
    `owner+admin is BLOCKED from editing tags on a "${status}" report`,
    async () => {
      const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, status);
      const result = await canEditReportTags(report, ctx.ownerAdmin);
      assert.equal(result.ok, false, `expected ok=false for ${status}`);
    },
  );
}

await test(
  "finance non-owner is blocked on a Draft report (outside the finance window)",
  async () => {
    const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, "Draft");
    const result = await canEditReportTags(report, ctx.financeNonOwner);
    assert.equal(result.ok, false, "expected ok=false for finance on Draft");
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.title, "Locked");
    }
  },
);

await test(
  "finance non-owner CAN edit tags on a Manager Approved report",
  async () => {
    const report = await makeReport(
      ctx.orgId,
      ctx.ownerAdmin.id,
      "Manager Approved",
    );
    const result = await canEditReportTags(report, ctx.financeNonOwner);
    assert.equal(
      result.ok,
      true,
      `expected ok=true for finance on Manager Approved, got ${JSON.stringify(result)}`,
    );
  },
);

// Manager+finance non-owner: a user who is BOTH the owner's direct
// manager AND a finance approver. The two paths are evaluated
// independently — manager grants the content-edit window, finance
// grants the wider finance window — so this user gets a union of both.
await test(
  "manager+finance non-owner CAN edit tags on a Draft (via manager path)",
  async () => {
    const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, "Draft");
    const result = await canEditReportTags(
      report,
      ctx.managerFinanceNonOwner,
    );
    assert.equal(
      result.ok,
      true,
      `expected ok=true for manager+finance on Draft, got ${JSON.stringify(result)}`,
    );
  },
);

for (const status of [
  "Finance Approved",
  "Posted to QuickBooks",
  "Ready for Payroll Reimbursement",
  "Sync Error",
] as WorkflowStatus[]) {
  await test(
    `manager+finance non-owner CAN edit tags on a "${status}" report (via finance path)`,
    async () => {
      const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, status);
      const result = await canEditReportTags(
        report,
        ctx.managerFinanceNonOwner,
      );
      assert.equal(
        result.ok,
        true,
        `expected ok=true for manager+finance on ${status}, got ${JSON.stringify(result)}`,
      );
    },
  );
}

await test(
  "manager+finance non-owner is BLOCKED on a Voided report (outside both windows)",
  async () => {
    const report = await makeReport(ctx.orgId, ctx.ownerAdmin.id, "Voided");
    const result = await canEditReportTags(
      report,
      ctx.managerFinanceNonOwner,
    );
    assert.equal(result.ok, false, "expected ok=false for Voided");
    if (!result.ok) {
      assert.equal(result.status, 409);
      assert.equal(result.title, "Locked");
    }
  },
);

// ---------- cleanup ----------
console.log("\nCleaning up test rows…");
try {
  if (createdOrgIds.length > 0) {
    await db
      .delete(expenseReportsTable)
      .where(inArray(expenseReportsTable.orgId, createdOrgIds));
    await db
      .delete(usersTable)
      .where(inArray(usersTable.orgId, createdOrgIds));
    await db.delete(orgsTable).where(inArray(orgsTable.id, createdOrgIds));
  }
  await db
    .delete(orgsTable)
    .where(like(orgsTable.name, "__tagperm_test_%"));
} catch (err) {
  console.error("Cleanup failed:", err);
}
await pool.end();

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
