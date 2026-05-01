/**
 * Expense-report domain tables.
 *
 * - `expense_reports` is the header (title, period, currency, totals,
 *   workflow status). The status column drives the state machine in
 *   `services/workflow.ts`.
 * - `expense_lines` are itemised charges; `lineSplits` distributes a single
 *   line across departments / GL accounts.
 * - `receipts` stores object-storage references to uploaded files.
 * - `approval_actions` is the immutable audit log of every status change
 *   (sequence-numbered per report).
 *
 * Money is stored as `numeric(14,2)` in the report's currency. All amounts
 * round-trip through `string` in TypeScript to avoid float precision drift.
 */
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orgsTable } from "./orgs";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";
import {
  paymentMethodEnum,
  roleEnum,
  workflowStatusEnum,
} from "./enums";

export const expenseReportsTable = pgTable(
  "expense_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    displayCode: text("display_code").notNull(),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    departmentId: uuid("department_id").references(() => departmentsTable.id, {
      onDelete: "set null",
    }),
    policy: text("policy").notNull().default("Standard Travel"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    status: workflowStatusEnum("status").notNull().default("Draft"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("expense_reports_org_code_unique").on(
      t.orgId,
      t.displayCode,
    ),
    statusIdx: index("expense_reports_status_idx").on(t.orgId, t.status),
    employeeIdx: index("expense_reports_employee_idx").on(t.employeeId),
  }),
);

export const lineItemsTable = pgTable(
  "line_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReportsTable.id, { onDelete: "cascade" }),
    occurredOn: date("occurred_on").notNull(),
    merchant: text("merchant").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull(),
    // numeric(12,2) — money is parsed as a string in node-postgres for safety.
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    reportIdx: index("line_items_report_idx").on(t.reportId),
  }),
);

export const receiptsTable = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    reportId: uuid("report_id").references(() => expenseReportsTable.id, {
      onDelete: "cascade",
    }),
    lineItemId: uuid("line_item_id").references(() => lineItemsTable.id, {
      onDelete: "set null",
    }),
    // /objects/<id> path returned by the upload-url endpoint.
    objectPath: text("object_path").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("receipts_report_idx").on(t.reportId),
    lineItemIdx: index("receipts_line_item_idx").on(t.lineItemId),
  }),
);

export const approvalActionsTable = pgTable(
  "approval_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReportsTable.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    actorRoles: roleEnum("actor_roles").array().notNull(),
    fromStatus: workflowStatusEnum("from_status").notNull(),
    toStatus: workflowStatusEnum("to_status").notNull(),
    comment: text("comment"),
    // Optional structured payload (e.g. QBO journal id, batch id, sync error).
    metadata: text("metadata"),
    sequence: integer("sequence").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("approval_actions_report_idx").on(
      t.reportId,
      t.sequence,
    ),
    actorRolesNonEmpty: check(
      "approval_actions_actor_roles_non_empty",
      sql`cardinality(${t.actorRoles}) > 0`,
    ),
  }),
);

// Field-level audit trail for content edits to a report and its children.
// `approval_actions` continues to capture workflow status transitions; this
// table captures who-changed-what at the column level on the report itself,
// its line items, and its receipts. Stored alongside (not merged into)
// approval_actions so each table keeps a single, focused shape.
export const auditEntityTypeEnum = pgEnum("audit_entity_type", [
  "report",
  "line_item",
  "receipt",
  "qbo_config",
  "qbo_tag",
  "qbo_mapping",
  "qbo_posting",
]);

export const AUDIT_CATEGORY_VALUES = ["report", "qbo"] as const;
export type AuditCategory = (typeof AUDIT_CATEGORY_VALUES)[number];
export const auditCategoryEnum = pgEnum("audit_category", AUDIT_CATEGORY_VALUES);

export const auditActionEnum = pgEnum("audit_action", [
  "created",
  "updated",
  "deleted",
]);

export const auditEntriesTable = pgTable(
  "audit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    // Nullable: QBO config events are org-scoped, not tied to a single report.
    reportId: uuid("report_id").references(() => expenseReportsTable.id, {
      onDelete: "cascade",
    }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    actorRoles: roleEnum("actor_roles").array().notNull(),
    category: auditCategoryEnum("category").notNull().default("report"),
    entityType: auditEntityTypeEnum("entity_type").notNull(),
    // entity_id is the id of the report, line item, or receipt the change
    // was applied to. For "report" rows this equals reportId; we still store
    // it explicitly so consumers can group/sort uniformly.
    entityId: uuid("entity_id").notNull(),
    action: auditActionEnum("action").notNull(),
    // Array of {field, before, after}. For "created" we capture the inserted
    // shape with before=null. For "deleted" we capture the prior shape with
    // after=null so the row stays meaningful after the entity is gone.
    fieldDiffs: jsonb("field_diffs").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportIdx: index("audit_entries_report_idx").on(t.reportId, t.createdAt),
    orgIdx: index("audit_entries_org_idx").on(t.orgId, t.createdAt),
    actorRolesNonEmpty: check(
      "audit_entries_actor_roles_non_empty",
      sql`cardinality(${t.actorRoles}) > 0`,
    ),
  }),
);

export type ExpenseReport = typeof expenseReportsTable.$inferSelect;
export type InsertExpenseReport = typeof expenseReportsTable.$inferInsert;
export type LineItem = typeof lineItemsTable.$inferSelect;
export type InsertLineItem = typeof lineItemsTable.$inferInsert;
export type Receipt = typeof receiptsTable.$inferSelect;
export type InsertReceipt = typeof receiptsTable.$inferInsert;
export type ApprovalAction = typeof approvalActionsTable.$inferSelect;
export type InsertApprovalAction = typeof approvalActionsTable.$inferInsert;
export type AuditEntry = typeof auditEntriesTable.$inferSelect;
export type InsertAuditEntry = typeof auditEntriesTable.$inferInsert;
export type AuditEntityType = (typeof auditEntityTypeEnum.enumValues)[number];
export type AuditAction = (typeof auditActionEnum.enumValues)[number];

export type AuditFieldDiff = {
  field: string;
  before: unknown;
  after: unknown;
};
