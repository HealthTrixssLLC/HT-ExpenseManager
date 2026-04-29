import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgsTable } from "./orgs";

export const glMappingsTable = pgTable(
  "gl_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    // Employee-facing category, e.g. "Travel:Airfare"
    code: text("code").notNull(),
    // QuickBooks-side account name.
    qboAccount: text("qbo_account").notNull(),
    qboAccountId: text("qbo_account_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgCodeUnique: uniqueIndex("gl_mappings_org_code_unique").on(
      t.orgId,
      t.code,
    ),
  }),
);

export type GlMapping = typeof glMappingsTable.$inferSelect;
export type InsertGlMapping = typeof glMappingsTable.$inferInsert;
