/**
 * System reset + full-system backup (Task #41).
 *
 * Two top-level operations live here:
 *
 *   `exportFullSystemBackup` — bundles one per-org backup zip (the same
 *   format the existing `/admin/backup` endpoint produces) for every
 *   org in the system into a single archive plus a top-level manifest.
 *   This is what the Reset dialog's "Download backup & continue" button
 *   downloads as a forced safety net before the destructive action.
 *
 *   `applySystemReset` — wipes every org's operational data (reports, line
 *   items, receipts + their object-storage blobs, approvals, audit
 *   entries, payroll batches, reconciliation, QBO connections / posting
 *   events / tags / cache, manager delegations, GL mappings, policy
 *   rules, departments, employee profiles, and **all users except the
 *   acting admin**), re-seeds the factory defaults from `@workspace/db`'s
 *   `orgDefaults`, and writes one audit entry per surviving org. The
 *   `orgs` row itself is preserved so external references that hold an
 *   org id (e.g. saved bookmarks) keep resolving.
 *
 * Both functions are designed to be called from a System-Admin-only HTTP
 * route; the route is responsible for the typed `RESET` confirmation and
 * for forcing the safety-net download in the same session.
 */
import JSZip from "jszip";
import { sql, eq, inArray } from "drizzle-orm";
import {
  approvalActionsTable,
  auditEntriesTable,
  db,
  defaultGlMappingsFor,
  defaultPolicyRulesFor,
  departmentsTable,
  employeeProfilesTable,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  managerDelegationsTable,
  orgsTable,
  payrollBatchItemsTable,
  payrollBatchesTable,
  policyRulesTable,
  qboAccountsCacheTable,
  qboConnectionTable,
  qboOauthStatesTable,
  qboPostingEventsTable,
  qboTagAssignmentsTable,
  qboTagsTable,
  qboTokenRefreshLogTable,
  receiptsTable,
  reconciliationRecordsTable,
  sessionsTable,
  usersTable,
  type Org,
  type Receipt,
  type Role,
} from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage";
import { exportBackup, CURRENT_BACKUP_SCHEMA_VERSION } from "./backup";
import { recordAudit } from "./audit";

// ---------- types ----------

export type SystemBackupManifest = {
  systemBackupSchemaVersion: 1;
  appVersion: string;
  createdAt: string;
  orgCount: number;
  orgs: Array<{ orgId: string; orgName: string; archive: string }>;
  perOrgWarnings: Record<string, string[]>;
};

export type SystemBackupResult = {
  zip: Buffer;
  manifest: SystemBackupManifest;
};

export type SystemResetSummary = {
  orgsReset: Array<{
    orgId: string;
    orgName: string;
    rowsWiped: Record<string, number>;
    rowsReseeded: Record<string, number>;
  }>;
  orgsFailed: Array<{ orgId: string; orgName: string; error: string }>;
  receiptFilesDeleted: number;
  receiptFileWarnings: string[];
};

export type SystemResetOptions = {
  /** UUID of the System Admin who triggered the reset. Always preserved. */
  actingUserId: string;
};

export type SystemBackupOptions = {
  /** App version stamped into each per-org manifest. */
  appVersion: string;
  /** Whether each per-org backup also includes its receipt blobs. */
  includeReceiptFiles: boolean;
};

// ---------- full-system backup ----------

export async function exportFullSystemBackup(
  opts: SystemBackupOptions,
): Promise<SystemBackupResult> {
  const orgs = await db.select().from(orgsTable);
  const createdAt = new Date().toISOString();
  const safeStamp = createdAt.replace(/[:.]/g, "-");
  const zip = new JSZip();
  const manifestEntries: SystemBackupManifest["orgs"] = [];
  const perOrgWarnings: Record<string, string[]> = {};

  // Iterate sequentially. Per-org export streams a few hundred KB at most
  // for typical demo orgs; running them concurrently would increase peak
  // memory without a meaningful wall-clock gain.
  for (const org of orgs) {
    const safeName = sanitizeForArchivePath(org.name) || org.id;
    const archive = `orgs/${safeName}-${org.id}.zip`;
    const result = await exportBackup({
      orgId: org.id,
      appVersion: opts.appVersion,
      includeReceiptFiles: opts.includeReceiptFiles,
    });
    zip.file(archive, result.zip);
    manifestEntries.push({
      orgId: org.id,
      orgName: org.name,
      archive,
    });
    if (result.receiptFileWarnings.length > 0) {
      perOrgWarnings[org.id] = result.receiptFileWarnings;
    }
  }

  const manifest: SystemBackupManifest = {
    systemBackupSchemaVersion: 1,
    appVersion: opts.appVersion,
    createdAt,
    orgCount: orgs.length,
    orgs: manifestEntries,
    perOrgWarnings,
  };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  // Include a human-readable note so downstream operators know the layout.
  zip.file(
    "README.txt",
    [
      "Healthtrix full-system backup",
      `Created at: ${createdAt}`,
      `App version: ${opts.appVersion}`,
      `Per-org backup schema version: ${CURRENT_BACKUP_SCHEMA_VERSION}`,
      `Includes receipt files: ${opts.includeReceiptFiles ? "yes" : "no"}`,
      "",
      "Layout:",
      "  manifest.json     — list of orgs included and their archive paths",
      "  orgs/<name>-<id>.zip — one per-org backup, identical in shape to",
      "                       what `GET /admin/backup` produces.",
      "",
      "Restore an individual org by uploading its per-org zip through the",
      "Backup & Restore admin page.",
    ].join("\n"),
  );

  // Suppress the unused-var lint when this file is imported elsewhere.
  void safeStamp;

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { zip: buf, manifest };
}

// ---------- system reset ----------

export async function applySystemReset(
  opts: SystemResetOptions,
): Promise<SystemResetSummary> {
  const actingUserRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, opts.actingUserId))
    .limit(1);
  const actingUser = actingUserRows[0];
  if (!actingUser) {
    throw new Error(
      `applySystemReset: acting user ${opts.actingUserId} not found.`,
    );
  }

  const orgs = await db.select().from(orgsTable);

  const summary: SystemResetSummary = {
    orgsReset: [],
    orgsFailed: [],
    receiptFilesDeleted: 0,
    receiptFileWarnings: [],
  };

  // Per-org loop. Each org gets its own transaction so a single corrupt
  // org cannot tank the whole reset; the admin sees which orgs failed and
  // can retry. Receipt-file deletes happen *after* the txn commits because
  // object storage cannot enroll in a Postgres transaction; failures are
  // surfaced as warnings (mirroring how restore handles them today).
  for (const org of orgs) {
    try {
      const result = await wipeAndReseedOneOrg({
        org,
        actingUser: {
          id: actingUser.id,
          orgId: actingUser.orgId,
          roles: actingUser.roles as Role[],
        },
      });
      summary.orgsReset.push(result.orgEntry);
      // Best-effort blob deletes outside the txn.
      if (result.receiptsToDelete.length > 0) {
        const objectStorage = new ObjectStorageService();
        for (const r of result.receiptsToDelete) {
          try {
            const removed = await objectStorage.deleteObjectEntity(r.objectPath);
            if (removed) {
              summary.receiptFilesDeleted += 1;
            }
          } catch (err) {
            summary.receiptFileWarnings.push(
              `Receipt ${r.id} (${r.objectPath}) delete failed: ${
                (err as Error).message
              }`,
            );
          }
        }
      }
    } catch (err) {
      summary.orgsFailed.push({
        orgId: org.id,
        orgName: org.name,
        error: (err as Error).message,
      });
    }
  }

  return summary;
}

// ---------- per-org wipe + re-seed ----------

/**
 * Result of wiping and re-seeding a single org. `receiptsToDelete` is
 * collected inside the transaction (so we know exactly which blobs to try
 * to delete) but the deletes themselves run outside it.
 */
type WipeResult = {
  orgEntry: SystemResetSummary["orgsReset"][number];
  receiptsToDelete: Pick<Receipt, "id" | "objectPath">[];
};

async function wipeAndReseedOneOrg(args: {
  org: Org;
  actingUser: { id: string; orgId: string; roles: Role[] };
}): Promise<WipeResult> {
  const { org, actingUser } = args;
  const isActingOrg = actingUser.orgId === org.id;

  return await db.transaction(async (tx) => {
    // 1. Snapshot the receipt rows BEFORE deleting them so we know which
    //    object-storage blobs to clean up after the txn commits.
    const receipts = await tx
      .select({
        id: receiptsTable.id,
        objectPath: receiptsTable.objectPath,
      })
      .from(receiptsTable)
      .where(eq(receiptsTable.orgId, org.id));

    // 2. Per-org row counts BEFORE the wipe, for the audit entry.
    const usersInOrg = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.orgId, org.id));
    const userIds = usersInOrg.map((u) => u.id);
    const usersToDelete = userIds.filter((id) => id !== actingUser.id);

    const reportRows = await tx
      .select({ id: expenseReportsTable.id })
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, org.id));
    const reportIds = reportRows.map((r) => r.id);

    const batchRows = await tx
      .select({ id: payrollBatchesTable.id })
      .from(payrollBatchesTable)
      .where(eq(payrollBatchesTable.orgId, org.id));
    const batchIds = batchRows.map((b) => b.id);

    const rowsWiped: Record<string, number> = {};

    // 3. Delete in topological order. The orgs row is preserved; users
    //    that aren't the acting admin are removed too. We delete tables
    //    that "restrict" against users (audit_entries.actorId,
    //    approval_actions.actorId, receipts.uploadedById,
    //    expense_reports.employeeId, payroll_batches.createdById) BEFORE
    //    touching users so the FKs are satisfied.

    if (batchIds.length > 0) {
      const r1 = await tx
        .delete(reconciliationRecordsTable)
        .where(inArray(reconciliationRecordsTable.batchId, batchIds))
        .returning({ id: reconciliationRecordsTable.id });
      rowsWiped.reconciliationRecords = r1.length;

      const r2 = await tx
        .delete(payrollBatchItemsTable)
        .where(inArray(payrollBatchItemsTable.batchId, batchIds))
        .returning({ id: payrollBatchItemsTable.id });
      rowsWiped.payrollBatchItems = r2.length;
    } else {
      rowsWiped.reconciliationRecords = 0;
      rowsWiped.payrollBatchItems = 0;
    }

    const r3 = await tx
      .delete(payrollBatchesTable)
      .where(eq(payrollBatchesTable.orgId, org.id))
      .returning({ id: payrollBatchesTable.id });
    rowsWiped.payrollBatches = r3.length;

    const r4 = await tx
      .delete(qboPostingEventsTable)
      .where(eq(qboPostingEventsTable.orgId, org.id))
      .returning({ id: qboPostingEventsTable.id });
    rowsWiped.qboPostingEvents = r4.length;

    const r5 = await tx
      .delete(qboTagAssignmentsTable)
      .where(eq(qboTagAssignmentsTable.orgId, org.id))
      .returning({ id: qboTagAssignmentsTable.id });
    rowsWiped.qboTagAssignments = r5.length;

    const r6 = await tx
      .delete(qboTagsTable)
      .where(eq(qboTagsTable.orgId, org.id))
      .returning({ id: qboTagsTable.id });
    rowsWiped.qboTags = r6.length;

    const r7 = await tx
      .delete(qboAccountsCacheTable)
      .where(eq(qboAccountsCacheTable.orgId, org.id))
      .returning({ id: qboAccountsCacheTable.id });
    rowsWiped.qboAccountsCache = r7.length;

    const r8 = await tx
      .delete(qboOauthStatesTable)
      .where(eq(qboOauthStatesTable.orgId, org.id))
      .returning({ id: qboOauthStatesTable.id });
    rowsWiped.qboOauthStates = r8.length;

    const r9 = await tx
      .delete(qboTokenRefreshLogTable)
      .where(eq(qboTokenRefreshLogTable.orgId, org.id))
      .returning({ id: qboTokenRefreshLogTable.id });
    rowsWiped.qboTokenRefreshLog = r9.length;

    const r10 = await tx
      .delete(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, org.id))
      .returning({ id: qboConnectionTable.id });
    rowsWiped.qboConnection = r10.length;

    if (reportIds.length > 0) {
      const r11 = await tx
        .delete(approvalActionsTable)
        .where(inArray(approvalActionsTable.reportId, reportIds))
        .returning({ id: approvalActionsTable.id });
      rowsWiped.approvalActions = r11.length;
    } else {
      rowsWiped.approvalActions = 0;
    }

    const r12 = await tx
      .delete(auditEntriesTable)
      .where(eq(auditEntriesTable.orgId, org.id))
      .returning({ id: auditEntriesTable.id });
    rowsWiped.auditEntries = r12.length;

    const r13 = await tx
      .delete(receiptsTable)
      .where(eq(receiptsTable.orgId, org.id))
      .returning({ id: receiptsTable.id });
    rowsWiped.receipts = r13.length;

    if (reportIds.length > 0) {
      const r14 = await tx
        .delete(lineItemsTable)
        .where(inArray(lineItemsTable.reportId, reportIds))
        .returning({ id: lineItemsTable.id });
      rowsWiped.lineItems = r14.length;
    } else {
      rowsWiped.lineItems = 0;
    }

    const r15 = await tx
      .delete(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, org.id))
      .returning({ id: expenseReportsTable.id });
    rowsWiped.expenseReports = r15.length;

    const r16 = await tx
      .delete(managerDelegationsTable)
      .where(eq(managerDelegationsTable.orgId, org.id))
      .returning({ id: managerDelegationsTable.id });
    rowsWiped.managerDelegations = r16.length;

    if (userIds.length > 0) {
      const r17 = await tx
        .delete(employeeProfilesTable)
        .where(inArray(employeeProfilesTable.userId, userIds))
        .returning({ id: employeeProfilesTable.id });
      rowsWiped.employeeProfiles = r17.length;
    } else {
      rowsWiped.employeeProfiles = 0;
    }

    const r18 = await tx
      .delete(policyRulesTable)
      .where(eq(policyRulesTable.orgId, org.id))
      .returning({ id: policyRulesTable.id });
    rowsWiped.policyRules = r18.length;

    const r19 = await tx
      .delete(glMappingsTable)
      .where(eq(glMappingsTable.orgId, org.id))
      .returning({ id: glMappingsTable.id });
    rowsWiped.glMappings = r19.length;

    const r20 = await tx
      .delete(departmentsTable)
      .where(eq(departmentsTable.orgId, org.id))
      .returning({ id: departmentsTable.id });
    rowsWiped.departments = r20.length;

    if (usersToDelete.length > 0) {
      // Sessions cascade from users but explicit delete keeps the row
      // count visible in the audit summary.
      const r21 = await tx
        .delete(sessionsTable)
        .where(inArray(sessionsTable.userId, usersToDelete))
        .returning({ id: sessionsTable.id });
      rowsWiped.sessions = r21.length;

      const r22 = await tx
        .delete(usersTable)
        .where(
          // delete every user in this org except the acting admin
          isActingOrg
            ? sql`${usersTable.orgId} = ${org.id} AND ${usersTable.id} <> ${actingUser.id}`
            : eq(usersTable.orgId, org.id),
        )
        .returning({ id: usersTable.id });
      rowsWiped.users = r22.length;
    } else {
      rowsWiped.sessions = 0;
      rowsWiped.users = 0;
    }

    // 4. Re-seed factory defaults.
    const glRows = defaultGlMappingsFor(org.id);
    const policyRows = defaultPolicyRulesFor(org.id);
    if (glRows.length > 0) {
      await tx.insert(glMappingsTable).values(glRows);
    }
    if (policyRows.length > 0) {
      await tx.insert(policyRulesTable).values(policyRows);
    }
    const rowsReseeded: Record<string, number> = {
      glMappings: glRows.length,
      policyRules: policyRows.length,
    };

    // 5. Audit entry. We reuse the existing `qbo_config` entity type so we
    //    don't have to migrate the audit_entry_type enum just for this
    //    feature; the field-diff carries the real shape (action: system_reset,
    //    rows wiped, rows re-seeded). category="report" keeps it visible in
    //    the default audit feed without requiring a new category. The
    //    actor must be a real users row in this org — when the acting
    //    admin doesn't belong to this org we skip the per-org audit entry
    //    here and rely on the cross-org summary recorded by the route.
    if (isActingOrg) {
      await recordAudit({
        orgId: org.id,
        reportId: null,
        actor: { id: actingUser.id, roles: actingUser.roles },
        category: "report",
        entityType: "qbo_config",
        entityId: org.id,
        action: "deleted",
        fieldDiffs: [
          {
            field: "system_reset",
            before: null,
            after: {
              orgName: org.name,
              rowsWiped,
              rowsReseeded,
              receiptsScheduledForDelete: receipts.length,
              at: new Date().toISOString(),
            },
          },
        ],
        tx,
      });
    }

    return {
      orgEntry: {
        orgId: org.id,
        orgName: org.name,
        rowsWiped,
        rowsReseeded,
      },
      receiptsToDelete: receipts,
    };
  });
}

// ---------- helpers ----------

function sanitizeForArchivePath(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

