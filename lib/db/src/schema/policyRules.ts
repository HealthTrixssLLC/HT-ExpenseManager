import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgsTable } from "./orgs";

// Free-form per-org settings: receipt threshold, per-diem caps, auto-flag
// amount. Stored as a single JSONB blob keyed by name so we don't have to
// migrate a row per knob.
export const policyRulesTable = pgTable(
  "policy_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    value: jsonb("value").notNull(),
    description: text("description"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgNameUnique: uniqueIndex("policy_rules_org_name_unique").on(
      t.orgId,
      t.name,
    ),
  }),
);

export type PolicyRule = typeof policyRulesTable.$inferSelect;
export type InsertPolicyRule = typeof policyRulesTable.$inferInsert;
