import {
  bigint,
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
    actorRole: roleEnum("actor_role").notNull(),
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
