import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgsTable } from "./orgs";
import { expenseReportsTable } from "./reports";
import { qboConnectionStatusEnum, qboPostingStatusEnum } from "./enums";

export const qboConnectionTable = pgTable(
  "qbo_connection",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    realmId: text("realm_id"),
    companyName: text("company_name"),
    status: qboConnectionStatusEnum("status").notNull().default("disconnected"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgUnique: uniqueIndex("qbo_connection_org_unique").on(t.orgId),
  }),
);

export const qboPostingEventsTable = pgTable("qbo_posting_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id")
    .notNull()
    .references(() => orgsTable.id, { onDelete: "cascade" }),
  reportId: uuid("report_id")
    .notNull()
    .references(() => expenseReportsTable.id, { onDelete: "cascade" }),
  journalId: text("journal_id").notNull(),
  payload: jsonb("payload").notNull(),
  status: qboPostingStatusEnum("status").notNull().default("posted"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type QboConnection = typeof qboConnectionTable.$inferSelect;
export type InsertQboConnection = typeof qboConnectionTable.$inferInsert;
export type QboPostingEvent = typeof qboPostingEventsTable.$inferSelect;
export type InsertQboPostingEvent =
  typeof qboPostingEventsTable.$inferInsert;
