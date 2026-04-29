import {
  AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { orgsTable } from "./orgs";
import { usersTable } from "./users";

// A manager_delegations row authorizes one Manager Approver (the "to") to
// act on behalf of another Manager Approver (the "from") for the open
// interval [startsAt, endsAt). endsAt nullable means open-ended until
// revoked. Created/managed by System Admin via /admin/delegations.
export const managerDelegationsTable = pgTable(
  "manager_delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    fromManagerId: uuid("from_manager_id")
      .notNull()
      .references((): AnyPgColumn => usersTable.id, { onDelete: "cascade" }),
    toManagerId: uuid("to_manager_id")
      .notNull()
      .references((): AnyPgColumn => usersTable.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    reason: text("reason"),
    createdById: uuid("created_by_id")
      .notNull()
      .references((): AnyPgColumn => usersTable.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    fromIdx: index("manager_delegations_from_idx").on(t.orgId, t.fromManagerId),
    toIdx: index("manager_delegations_to_idx").on(t.orgId, t.toManagerId),
  }),
);

export type ManagerDelegation = typeof managerDelegationsTable.$inferSelect;
export type InsertManagerDelegation =
  typeof managerDelegationsTable.$inferInsert;
