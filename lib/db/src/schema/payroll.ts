import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgsTable } from "./orgs";
import { usersTable } from "./users";
import { expenseReportsTable } from "./reports";
import {
  payrollBatchStatusEnum,
  reconciliationFlagEnum,
} from "./enums";

export const payrollBatchesTable = pgTable("payroll_batches", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgsTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  status: payrollBatchStatusEnum("status").notNull().default("Draft"),
  createdById: uuid("created_by_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "restrict" }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const payrollBatchItemsTable = pgTable(
  "payroll_batch_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => payrollBatchesTable.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReportsTable.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    batchIdx: index("payroll_batch_items_batch_idx").on(t.batchId),
  }),
);

export const reconciliationRecordsTable = pgTable(
  "reconciliation_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => payrollBatchesTable.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReportsTable.id, { onDelete: "restrict" }),
    expectedAmount: numeric("expected_amount", {
      precision: 12,
      scale: 2,
    }).notNull(),
    paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull(),
    variance: numeric("variance", { precision: 12, scale: 2 }).notNull(),
    flag: reconciliationFlagEnum("flag").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    batchIdx: index("reconciliation_records_batch_idx").on(t.batchId),
  }),
);

export type PayrollBatch = typeof payrollBatchesTable.$inferSelect;
export type InsertPayrollBatch = typeof payrollBatchesTable.$inferInsert;
export type PayrollBatchItem = typeof payrollBatchItemsTable.$inferSelect;
export type InsertPayrollBatchItem =
  typeof payrollBatchItemsTable.$inferInsert;
export type ReconciliationRecord =
  typeof reconciliationRecordsTable.$inferSelect;
export type InsertReconciliationRecord =
  typeof reconciliationRecordsTable.$inferInsert;
