import { db, auditEntriesTable } from "../lib/db";
import type {
  AuditAction,
  AuditEntityType,
  AuditFieldDiff,
  AuditEntry,
  Role,
} from "@workspace/db";

type DbClient = typeof db;
type Tx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

export type RecordAuditInput = {
  orgId: string;
  reportId: string;
  actor: { id: string; roles: Role[] };
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  fieldDiffs: AuditFieldDiff[];
  // Optional ambient transaction so the audit row is persisted in the same
  // transaction as the underlying mutation. If omitted we use the top-level
  // db client which is fine for single-statement updates.
  tx?: Tx;
};

// Persists an audit entry. Returns null when no diffs are supplied for an
// "updated" action — callers should skip writing entries for no-op updates.
export async function recordAudit(
  input: RecordAuditInput,
): Promise<AuditEntry | null> {
  if (input.action === "updated" && input.fieldDiffs.length === 0) {
    return null;
  }
  const exec = input.tx ?? db;
  const [row] = await exec
    .insert(auditEntriesTable)
    .values({
      orgId: input.orgId,
      reportId: input.reportId,
      actorId: input.actor.id,
      actorRoles: input.actor.roles,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      fieldDiffs: input.fieldDiffs as unknown as object,
    })
    .returning();
  return row;
}

// Helper that diffs two row snapshots field-by-field. `fields` lists the
// keys to consider so we don't accidentally include timestamps / ids in the
// diff. Equality treats null and undefined as the same value (so an
// "unset" field stays out of the diff). Dates and arrays are compared by
// their JSON representation; everything else uses === / !==.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: ReadonlyArray<keyof T>,
): AuditFieldDiff[] {
  const out: AuditFieldDiff[] = [];
  for (const field of fields) {
    const a = before[field];
    const b = after[field];
    if (valuesEqual(a, b)) continue;
    out.push({
      field: String(field),
      before: serializeForAudit(a),
      after: serializeForAudit(b),
    });
  }
  return out;
}

// Builds the "this entity was just created" diff: every field listed gets
// before=null and after=<the new value>. Used by create/insert handlers so
// the audit log captures the full initial snapshot.
export function snapshotForCreate<T extends Record<string, unknown>>(
  row: T,
  fields: ReadonlyArray<keyof T>,
): AuditFieldDiff[] {
  return fields.map((field) => ({
    field: String(field),
    before: null,
    after: serializeForAudit(row[field]),
  }));
}

// Mirror of snapshotForCreate but for deletes: every listed field becomes
// before=<the old value> and after=null. Persisted with the "deleted" row
// before the entity is removed so the audit log stays meaningful.
export function snapshotForDelete<T extends Record<string, unknown>>(
  row: T,
  fields: ReadonlyArray<keyof T>,
): AuditFieldDiff[] {
  return fields.map((field) => ({
    field: String(field),
    before: serializeForAudit(row[field]),
    after: null,
  }));
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!valuesEqual(a[i], b[i])) return false;
    }
    return true;
  }
  // Final fallback: JSON shape match catches plain-object-equal cases like
  // Date-as-ISO vs Date-as-Date when one side has been serialized.
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function serializeForAudit(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}
