import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const orgsTable = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Org = typeof orgsTable.$inferSelect;
export type InsertOrg = typeof orgsTable.$inferInsert;
