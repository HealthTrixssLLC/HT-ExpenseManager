/**
 * Org-scoped backup + restore service.
 *
 * `exportBackup({ orgId, includeReceiptFiles })` returns a Buffer holding a
 * ZIP archive with this layout:
 *
 *   manifest.json           — header (see ManifestV1 below). Always present.
 *   payload.json            — full org dump in CURRENT_BACKUP_SCHEMA_VERSION
 *                              shape (see BackupPayloadV1).
 *   receipts/<objectPath>   — one file per receipt row when
 *                              `includesReceiptFiles` is true. The path
 *                              under `receipts/` mirrors the receipt's
 *                              canonical `objectPath` (e.g. `objects/<bucket
 *                              path>/<uuid>`) so the archive is
 *                              human-inspectable and a restore can recover
 *                              the original storage key without depending
 *                              on the database id.
 *
 * `applyRestore({ orgId, zipBuffer })` is the inverse. It:
 *   1. Parses the manifest and rejects schema versions newer than this app
 *      knows about and zips whose `orgId` does not match the caller's org.
 *   2. Runs the version chain in `versions.ts` to upgrade older payloads to
 *      the current shape.
 *   3. Inside one DB transaction, deletes everything for that org (cascade
 *      from the `orgs` row) and re-inserts the payload, preserving every
 *      primary key so external references (e.g. `displayCode`) stay stable.
 *   4. If `includesReceiptFiles`, re-uploads each receipt blob to its
 *      original `objectPath`. Missing blobs are tolerated and logged so a
 *      partially-corrupt backup still restores the database side.
 *
 * Restore is "all or nothing" at the DB level — if any insert fails the
 * transaction rolls back. Receipt-file re-uploads happen outside the txn
 * (they cannot be transactional with GCS) and are reported as warnings on
 * the result.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
import JSZip from "jszip";
import type { JSZipObject } from "jszip";
import { sql, eq } from "drizzle-orm";
import {
  db,
  orgsTable,
  departmentsTable,
  usersTable,
  employeeProfilesTable,
  glMappingsTable,
  policyRulesTable,
  qboConnectionTable,
  qboPostingEventsTable,
  managerDelegationsTable,
  expenseReportsTable,
  lineItemsTable,
  receiptsTable,
  approvalActionsTable,
  auditEntriesTable,
  payrollBatchesTable,
  payrollBatchItemsTable,
  reconciliationRecordsTable,
  type Org,
  type Department,
  type User,
  type EmployeeProfile,
  type GlMapping,
  type PolicyRule,
  type QboConnection,
  type QboPostingEvent,
  type ManagerDelegation,
  type ExpenseReport,
  type LineItem,
  type Receipt,
  type ApprovalAction,
  type AuditEntry,
  type PayrollBatch,
  type PayrollBatchItem,
  type ReconciliationRecord,
} from "@workspace/db";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../../lib/objectStorage";
import {
  CURRENT_BACKUP_SCHEMA_VERSION,
  BackupVersionError,
  upgradeToCurrent,
} from "./versions";

// ---------- public types ----------

export type ManifestV1 = {
  backupSchemaVersion: number;
  appVersion: string;
  orgId: string;
  orgName: string;
  createdAt: string;
  includesReceiptFiles: boolean;
  receiptCount: number;
  rowCounts: Record<string, number>;
};

/**
 * Snapshot of every org-scoped table. All ids are kept verbatim so the
 * restored data references the same UUIDs it referenced before.
 */
export type BackupPayloadV1 = {
  org: Org;
  departments: Department[];
  users: User[];
  employeeProfiles: EmployeeProfile[];
  glMappings: GlMapping[];
  policyRules: PolicyRule[];
  qboConnection: QboConnection | null;
  qboPostingEvents: QboPostingEvent[];
  managerDelegations: ManagerDelegation[];
  expenseReports: ExpenseReport[];
  lineItems: LineItem[];
  receipts: Receipt[];
  approvalActions: ApprovalAction[];
  auditEntries: AuditEntry[];
  payrollBatches: PayrollBatch[];
  payrollBatchItems: PayrollBatchItem[];
  reconciliationRecords: ReconciliationRecord[];
};

export type ExportOptions = {
  orgId: string;
  appVersion: string;
  includeReceiptFiles: boolean;
};

export type ExportResult = {
  zip: Buffer;
  manifest: ManifestV1;
  receiptFileWarnings: string[];
};

export type ParsedBackup = {
  manifest: ManifestV1;
  payload: BackupPayloadV1;
  /** Map from receipt id -> { filename, mimeType, data }. May be empty. */
  receiptFiles: Map<
    string,
    { filename: string; mimeType: string; data: Buffer }
  >;
};

export type RestoreOptions = {
  /** Caller's current org id; the manifest must match this exactly. */
  orgId: string;
  zipBuffer: Buffer;
};

export type RestoreResult = {
  manifest: ManifestV1;
  rowCountsRestored: Record<string, number>;
  receiptFilesRestored: number;
  receiptFileWarnings: string[];
};

export class BackupParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupParseError";
    Object.setPrototypeOf(this, BackupParseError.prototype);
  }
}

export class BackupOrgMismatchError extends Error {
  constructor(public expectedOrgId: string, public manifestOrgId: string) {
    super(
      `Backup is for org ${manifestOrgId} but caller is in org ${expectedOrgId}.`,
    );
    this.name = "BackupOrgMismatchError";
    Object.setPrototypeOf(this, BackupOrgMismatchError.prototype);
  }
}

// ---------- export ----------

export async function exportBackup(
  opts: ExportOptions,
): Promise<ExportResult> {
  const { orgId, appVersion, includeReceiptFiles } = opts;

  const [org] = await db.select().from(orgsTable).where(eq(orgsTable.id, orgId));
  if (!org) {
    throw new BackupParseError(`Org ${orgId} not found.`);
  }

  const [
    departments,
    users,
    employeeProfiles,
    glMappings,
    policyRules,
    qboConnections,
    qboPostingEvents,
    managerDelegations,
    expenseReports,
    lineItems,
    receipts,
    approvalActions,
    auditEntries,
    payrollBatches,
    payrollBatchItems,
    reconciliationRecords,
  ] = await Promise.all([
    db.select().from(departmentsTable).where(eq(departmentsTable.orgId, orgId)),
    db.select().from(usersTable).where(eq(usersTable.orgId, orgId)),
    db
      .select()
      .from(employeeProfilesTable)
      .innerJoin(usersTable, eq(employeeProfilesTable.userId, usersTable.id))
      .where(eq(usersTable.orgId, orgId))
      .then((rows) => rows.map((r) => r.employee_profiles)),
    db.select().from(glMappingsTable).where(eq(glMappingsTable.orgId, orgId)),
    db.select().from(policyRulesTable).where(eq(policyRulesTable.orgId, orgId)),
    db
      .select()
      .from(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, orgId)),
    db
      .select()
      .from(qboPostingEventsTable)
      .where(eq(qboPostingEventsTable.orgId, orgId)),
    db
      .select()
      .from(managerDelegationsTable)
      .where(eq(managerDelegationsTable.orgId, orgId)),
    db
      .select()
      .from(expenseReportsTable)
      .where(eq(expenseReportsTable.orgId, orgId)),
    db
      .select()
      .from(lineItemsTable)
      .innerJoin(
        expenseReportsTable,
        eq(lineItemsTable.reportId, expenseReportsTable.id),
      )
      .where(eq(expenseReportsTable.orgId, orgId))
      .then((rows) => rows.map((r) => r.line_items)),
    db.select().from(receiptsTable).where(eq(receiptsTable.orgId, orgId)),
    db
      .select()
      .from(approvalActionsTable)
      .innerJoin(
        expenseReportsTable,
        eq(approvalActionsTable.reportId, expenseReportsTable.id),
      )
      .where(eq(expenseReportsTable.orgId, orgId))
      .then((rows) => rows.map((r) => r.approval_actions)),
    db
      .select()
      .from(auditEntriesTable)
      .where(eq(auditEntriesTable.orgId, orgId)),
    db
      .select()
      .from(payrollBatchesTable)
      .where(eq(payrollBatchesTable.orgId, orgId)),
    db
      .select()
      .from(payrollBatchItemsTable)
      .innerJoin(
        payrollBatchesTable,
        eq(payrollBatchItemsTable.batchId, payrollBatchesTable.id),
      )
      .where(eq(payrollBatchesTable.orgId, orgId))
      .then((rows) => rows.map((r) => r.payroll_batch_items)),
    db
      .select()
      .from(reconciliationRecordsTable)
      .innerJoin(
        payrollBatchesTable,
        eq(reconciliationRecordsTable.batchId, payrollBatchesTable.id),
      )
      .where(eq(payrollBatchesTable.orgId, orgId))
      .then((rows) => rows.map((r) => r.reconciliation_records)),
  ]);

  const payload: BackupPayloadV1 = {
    org,
    departments,
    users,
    employeeProfiles,
    glMappings,
    policyRules,
    qboConnection: qboConnections[0] ?? null,
    qboPostingEvents,
    managerDelegations,
    expenseReports,
    lineItems,
    receipts,
    approvalActions,
    auditEntries,
    payrollBatches,
    payrollBatchItems,
    reconciliationRecords,
  };

  const rowCounts: Record<string, number> = {
    departments: departments.length,
    users: users.length,
    employeeProfiles: employeeProfiles.length,
    glMappings: glMappings.length,
    policyRules: policyRules.length,
    qboConnection: qboConnections.length,
    qboPostingEvents: qboPostingEvents.length,
    managerDelegations: managerDelegations.length,
    expenseReports: expenseReports.length,
    lineItems: lineItems.length,
    receipts: receipts.length,
    approvalActions: approvalActions.length,
    auditEntries: auditEntries.length,
    payrollBatches: payrollBatches.length,
    payrollBatchItems: payrollBatchItems.length,
    reconciliationRecords: reconciliationRecords.length,
  };

  const manifest: ManifestV1 = {
    backupSchemaVersion: CURRENT_BACKUP_SCHEMA_VERSION,
    appVersion,
    orgId,
    orgName: org.name,
    createdAt: new Date().toISOString(),
    includesReceiptFiles: includeReceiptFiles,
    receiptCount: receipts.length,
    rowCounts,
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("payload.json", JSON.stringify(payload, jsonReplacer, 2));

  const warnings: string[] = [];
  if (includeReceiptFiles && receipts.length > 0) {
    const objectStorage = new ObjectStorageService();
    for (const r of receipts) {
      try {
        const file = await objectStorage.getObjectEntityFile(r.objectPath);
        const [buf] = await file.download();
        // Store under `receipts/<objectPath-relative>` so the archive
        // preserves the canonical storage layout. We strip a leading
        // slash so JSZip doesn't interpret it as an absolute path.
        const archivePath = receiptArchivePath(r.objectPath);
        zip.file(archivePath, buf);
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          warnings.push(`Receipt ${r.id} object missing at ${r.objectPath}`);
        } else {
          warnings.push(
            `Receipt ${r.id} download failed: ${(err as Error).message}`,
          );
        }
      }
    }
  }

  const buf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return { zip: buf, manifest, receiptFileWarnings: warnings };
}

// ---------- parse ----------

export async function parseBackup(zipBuffer: Buffer): Promise<ParsedBackup> {
  const zip = await JSZip.loadAsync(zipBuffer).catch((err: unknown) => {
    throw new BackupParseError(
      `Could not read zip: ${(err as Error).message}`,
    );
  });

  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) {
    throw new BackupParseError("Backup is missing manifest.json.");
  }
  const payloadEntry = zip.file("payload.json");
  if (!payloadEntry) {
    throw new BackupParseError("Backup is missing payload.json.");
  }

  const manifestText = await manifestEntry.async("string");
  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestText);
  } catch (err) {
    throw new BackupParseError(
      `manifest.json is not valid JSON: ${(err as Error).message}`,
    );
  }
  const manifest = validateManifest(rawManifest);

  const payloadText = await payloadEntry.async("string");
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(payloadText);
  } catch (err) {
    throw new BackupParseError(
      `payload.json is not valid JSON: ${(err as Error).message}`,
    );
  }

  const upgraded = upgradeToCurrent(rawPayload, manifest.backupSchemaVersion);
  const payload = upgraded as BackupPayloadV1;
  if (!payload || typeof payload !== "object" || !payload.org) {
    throw new BackupParseError("payload.json is missing the org section.");
  }

  if (payload.org.id !== manifest.orgId) {
    throw new BackupParseError(
      `Manifest orgId (${manifest.orgId}) does not match payload org id (${payload.org.id}).`,
    );
  }

  const receiptFiles = new Map<
    string,
    { filename: string; mimeType: string; data: Buffer }
  >();
  if (manifest.includesReceiptFiles) {
    // Build a lookup from canonical archive path -> receipt row so we can
    // recover the receipt id (and original mime/filename) from the file's
    // path inside the zip. The archive layout is the receipt's
    // `objectPath` rooted under `receipts/`.
    const byArchivePath = new Map<string, BackupPayloadV1["receipts"][number]>();
    for (const r of payload.receipts ?? []) {
      byArchivePath.set(receiptArchivePath(r.objectPath), r);
    }
    const tasks: Promise<void>[] = [];
    zip.forEach((relativePath: string, file: JSZipObject) => {
      if (file.dir) return;
      if (!relativePath.startsWith("receipts/")) return;
      tasks.push(
        (async () => {
          const matched = byArchivePath.get(relativePath);
          const data = await file.async("nodebuffer");
          if (matched) {
            receiptFiles.set(matched.id, {
              filename: matched.filename,
              mimeType: matched.mimeType ?? "application/octet-stream",
              data,
            });
            return;
          }
          // Backwards-compat: pre-canonical-layout backups stored receipts
          // as `receipts/<receiptId>.<ext>`. Fall back to id-by-filename
          // lookup so older archives still restore.
          const baseName = relativePath.replace(/^.*\//, "");
          const idGuess = baseName.replace(/\.[^.]+$/, "");
          const fallback = (payload.receipts ?? []).find(
            (r) => r.id === idGuess,
          );
          if (fallback) {
            receiptFiles.set(fallback.id, {
              filename: fallback.filename,
              mimeType: fallback.mimeType ?? "application/octet-stream",
              data,
            });
          }
        })(),
      );
    });
    await Promise.all(tasks);
  }

  // Hydrate Date columns: JSON.stringify converted them to ISO strings.
  reviveDates(payload);

  return { manifest, payload, receiptFiles };
}

// ---------- restore ----------

export async function applyRestore(
  opts: RestoreOptions,
): Promise<RestoreResult> {
  const parsed = await parseBackup(opts.zipBuffer);
  const { manifest, payload, receiptFiles } = parsed;

  if (manifest.orgId !== opts.orgId) {
    throw new BackupOrgMismatchError(opts.orgId, manifest.orgId);
  }
  if (payload.org.id !== opts.orgId) {
    throw new BackupOrgMismatchError(opts.orgId, payload.org.id);
  }

  const restoredCounts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // CASCADE wipes everything via the orgs FK chain, plus tables that
    // reference users (employee_profiles, sessions, etc.).
    await tx.delete(orgsTable).where(eq(orgsTable.id, opts.orgId));

    // Re-create the org with the same id so all FK references in the
    // payload resolve.
    await tx.insert(orgsTable).values(payload.org);
    restoredCounts.org = 1;

    if (payload.departments.length > 0) {
      await tx.insert(departmentsTable).values(payload.departments);
    }
    restoredCounts.departments = payload.departments.length;

    if (payload.users.length > 0) {
      // First pass: managerId nulled so we can insert in any order.
      const usersFirstPass = payload.users.map((u) => ({
        ...u,
        managerId: null as string | null,
      }));
      await tx.insert(usersTable).values(usersFirstPass);
      // Second pass: restore manager pointers.
      for (const u of payload.users) {
        if (u.managerId) {
          await tx
            .update(usersTable)
            .set({ managerId: u.managerId })
            .where(eq(usersTable.id, u.id));
        }
      }
    }
    restoredCounts.users = payload.users.length;

    if (payload.employeeProfiles.length > 0) {
      await tx.insert(employeeProfilesTable).values(payload.employeeProfiles);
    }
    restoredCounts.employeeProfiles = payload.employeeProfiles.length;

    if (payload.glMappings.length > 0) {
      await tx.insert(glMappingsTable).values(payload.glMappings);
    }
    restoredCounts.glMappings = payload.glMappings.length;

    if (payload.policyRules.length > 0) {
      await tx.insert(policyRulesTable).values(payload.policyRules);
    }
    restoredCounts.policyRules = payload.policyRules.length;

    if (payload.qboConnection) {
      await tx.insert(qboConnectionTable).values(payload.qboConnection);
      restoredCounts.qboConnection = 1;
    } else {
      restoredCounts.qboConnection = 0;
    }

    if (payload.managerDelegations.length > 0) {
      await tx
        .insert(managerDelegationsTable)
        .values(payload.managerDelegations);
    }
    restoredCounts.managerDelegations = payload.managerDelegations.length;

    if (payload.expenseReports.length > 0) {
      await tx.insert(expenseReportsTable).values(payload.expenseReports);
    }
    restoredCounts.expenseReports = payload.expenseReports.length;

    if (payload.lineItems.length > 0) {
      await tx.insert(lineItemsTable).values(payload.lineItems);
    }
    restoredCounts.lineItems = payload.lineItems.length;

    if (payload.receipts.length > 0) {
      await tx.insert(receiptsTable).values(payload.receipts);
    }
    restoredCounts.receipts = payload.receipts.length;

    if (payload.approvalActions.length > 0) {
      await tx.insert(approvalActionsTable).values(payload.approvalActions);
    }
    restoredCounts.approvalActions = payload.approvalActions.length;

    if (payload.auditEntries.length > 0) {
      await tx.insert(auditEntriesTable).values(payload.auditEntries);
    }
    restoredCounts.auditEntries = payload.auditEntries.length;

    if (payload.qboPostingEvents.length > 0) {
      await tx
        .insert(qboPostingEventsTable)
        .values(payload.qboPostingEvents);
    }
    restoredCounts.qboPostingEvents = payload.qboPostingEvents.length;

    if (payload.payrollBatches.length > 0) {
      await tx.insert(payrollBatchesTable).values(payload.payrollBatches);
    }
    restoredCounts.payrollBatches = payload.payrollBatches.length;

    if (payload.payrollBatchItems.length > 0) {
      await tx
        .insert(payrollBatchItemsTable)
        .values(payload.payrollBatchItems);
    }
    restoredCounts.payrollBatchItems = payload.payrollBatchItems.length;

    if (payload.reconciliationRecords.length > 0) {
      await tx
        .insert(reconciliationRecordsTable)
        .values(payload.reconciliationRecords);
    }
    restoredCounts.reconciliationRecords =
      payload.reconciliationRecords.length;
  });

  // Best-effort: re-upload receipt blobs after the txn commits. This is the
  // only step that cannot participate in the DB transaction (object storage
  // is a separate system), so we surface failures as warnings rather than
  // rolling back.
  const warnings: string[] = [];
  let receiptFilesRestored = 0;
  if (receiptFiles.size > 0) {
    const objectStorage = new ObjectStorageService();
    for (const r of payload.receipts) {
      const blob = receiptFiles.get(r.id);
      if (!blob) continue;
      try {
        await uploadReceiptBlob({
          objectStorage,
          objectPath: r.objectPath,
          mimeType: blob.mimeType,
          data: blob.data,
        });
        receiptFilesRestored += 1;
      } catch (err) {
        warnings.push(
          `Receipt ${r.id} re-upload failed: ${(err as Error).message}`,
        );
      }
    }
  }

  return {
    manifest,
    rowCountsRestored: restoredCounts,
    receiptFilesRestored,
    receiptFileWarnings: warnings,
  };
}

// ---------- helpers ----------

/**
 * `uploadReceiptBlob` writes a single receipt to its canonical
 * `objectPath` using a short-lived signed PUT URL. We rebuild the upload
 * key from `objectPath` rather than going through the public
 * `getReceiptUploadURL` helper because the latter generates a *new*
 * receipt id; here we want to restore exactly to the original key.
 */
async function uploadReceiptBlob(args: {
  objectStorage: ObjectStorageService;
  objectPath: string;
  mimeType: string;
  data: Buffer;
}): Promise<void> {
  const tail = args.objectPath.replace(/^\/objects\//, "");
  const privateObjectDir = args.objectStorage
    .getPrivateObjectDir()
    .replace(/\/+$/, "");
  const fullPath = `${privateObjectDir}/${tail}`;
  // signObjectURL is private to objectStorage; reuse its public surface
  // by going through getObjectEntityFile when the object already exists,
  // otherwise sign a PUT URL via the sidecar.
  const slash = fullPath.indexOf("/", 1);
  const bucketName = fullPath.slice(1, slash);
  const objectName = fullPath.slice(slash + 1);
  const signRes = await fetch(
    "http://127.0.0.1:1106/object-storage/signed-object-url",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!signRes.ok) {
    throw new Error(`sign PUT failed (${signRes.status})`);
  }
  const { signed_url: signedURL } = (await signRes.json()) as {
    signed_url: string;
  };
  const putRes = await fetch(signedURL, {
    method: "PUT",
    headers: { "Content-Type": args.mimeType || "application/octet-stream" },
    body: new Uint8Array(args.data),
    signal: AbortSignal.timeout(60_000),
  });
  if (!putRes.ok) {
    throw new Error(`PUT object failed (${putRes.status})`);
  }
}

/**
 * Map a receipt's canonical `objectPath` (which always starts with
 * `/objects/...`) into a path inside the zip. We strip the leading slash
 * and root the result under `receipts/` so:
 *
 *   /objects/uploads/abc-123  →  receipts/objects/uploads/abc-123
 *
 * This mirrors the original storage hierarchy so the archive is
 * inspectable and the restore path is unambiguous.
 */
function receiptArchivePath(objectPath: string): string {
  const trimmed = objectPath.replace(/^\/+/, "");
  return `receipts/${trimmed}`;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
}

// `JSON.parse` returns plain ISO strings for our timestamp columns. Drizzle's
// insert builders happily accept either Date or string for `timestamp`/
// `date` columns, so we leave most strings alone — but `Date` columns that
// land in PostgreSQL JSON expect the canonical Date object on the way back
// out of the round-trip. The fields below are the ones we read in tests so
// keeping them as Date avoids accidental ISO-string drift.
function reviveDates(payload: BackupPayloadV1): void {
  payload.org.createdAt = toDate(payload.org.createdAt);
  for (const d of payload.departments) d.createdAt = toDate(d.createdAt);
  for (const u of payload.users) {
    u.createdAt = toDate(u.createdAt);
    u.updatedAt = toDate(u.updatedAt);
  }
  for (const p of payload.employeeProfiles) {
    p.createdAt = toDate(p.createdAt);
    p.updatedAt = toDate(p.updatedAt);
  }
  for (const g of payload.glMappings) {
    g.createdAt = toDate(g.createdAt);
    g.updatedAt = toDate(g.updatedAt);
  }
  for (const r of payload.policyRules) r.updatedAt = toDate(r.updatedAt);
  if (payload.qboConnection) {
    payload.qboConnection.updatedAt = toDate(payload.qboConnection.updatedAt);
    payload.qboConnection.connectedAt = toNullableDate(
      payload.qboConnection.connectedAt,
    );
    payload.qboConnection.lastSyncAt = toNullableDate(
      payload.qboConnection.lastSyncAt,
    );
  }
  for (const e of payload.qboPostingEvents) e.createdAt = toDate(e.createdAt);
  for (const m of payload.managerDelegations) {
    m.createdAt = toDate(m.createdAt);
    m.startsAt = toDate(m.startsAt);
    m.endsAt = toNullableDate(m.endsAt);
    m.revokedAt = toNullableDate(m.revokedAt);
  }
  for (const r of payload.expenseReports) {
    r.createdAt = toDate(r.createdAt);
    r.updatedAt = toDate(r.updatedAt);
    r.submittedAt = toNullableDate(r.submittedAt);
  }
  for (const l of payload.lineItems) {
    l.createdAt = toDate(l.createdAt);
    l.updatedAt = toDate(l.updatedAt);
  }
  for (const r of payload.receipts) r.createdAt = toDate(r.createdAt);
  for (const a of payload.approvalActions) a.createdAt = toDate(a.createdAt);
  for (const a of payload.auditEntries) a.createdAt = toDate(a.createdAt);
  for (const b of payload.payrollBatches) {
    b.createdAt = toDate(b.createdAt);
    b.paidAt = toNullableDate(b.paidAt);
    b.reconciledAt = toNullableDate(b.reconciledAt);
  }
  for (const i of payload.payrollBatchItems) i.createdAt = toDate(i.createdAt);
  for (const r of payload.reconciliationRecords)
    r.createdAt = toDate(r.createdAt);
}

function toDate(v: unknown): Date {
  if (v instanceof Date) return v;
  if (typeof v === "string") return new Date(v);
  throw new BackupParseError(`Expected ISO timestamp, got ${typeof v}`);
}

function toNullableDate(v: unknown): Date | null {
  if (v == null) return null;
  return toDate(v);
}

function validateManifest(raw: unknown): ManifestV1 {
  if (!raw || typeof raw !== "object") {
    throw new BackupParseError("manifest.json is not an object.");
  }
  const m = raw as Partial<ManifestV1>;
  if (typeof m.backupSchemaVersion !== "number") {
    throw new BackupParseError("manifest.json missing backupSchemaVersion.");
  }
  if (typeof m.appVersion !== "string") {
    throw new BackupParseError("manifest.json missing appVersion.");
  }
  if (typeof m.orgId !== "string") {
    throw new BackupParseError("manifest.json missing orgId.");
  }
  if (typeof m.orgName !== "string") {
    throw new BackupParseError("manifest.json missing orgName.");
  }
  if (typeof m.createdAt !== "string") {
    throw new BackupParseError("manifest.json missing createdAt.");
  }
  if (typeof m.includesReceiptFiles !== "boolean") {
    throw new BackupParseError(
      "manifest.json missing includesReceiptFiles.",
    );
  }
  return {
    backupSchemaVersion: m.backupSchemaVersion,
    appVersion: m.appVersion,
    orgId: m.orgId,
    orgName: m.orgName,
    createdAt: m.createdAt,
    includesReceiptFiles: m.includesReceiptFiles,
    receiptCount: typeof m.receiptCount === "number" ? m.receiptCount : 0,
    rowCounts:
      m.rowCounts && typeof m.rowCounts === "object"
        ? (m.rowCounts as Record<string, number>)
        : {},
  };
}

// Re-exports for convenience at the route layer.
export { CURRENT_BACKUP_SCHEMA_VERSION, BackupVersionError, sql };
