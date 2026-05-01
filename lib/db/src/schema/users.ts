import {
  AnyPgColumn,
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orgsTable } from "./orgs";
import { departmentsTable } from "./departments";
import { roleEnum } from "./enums";

export const usersTable = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    title: text("title"),
    roles: roleEnum("roles").array().notNull(),
    // Approver roles often also submit reports themselves.
    isAlsoEmployee: boolean("is_also_employee").notNull().default(false),
    departmentId: uuid("department_id").references(() => departmentsTable.id, {
      onDelete: "set null",
    }),
    managerId: uuid("manager_id").references((): AnyPgColumn => usersTable.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgEmailUnique: uniqueIndex("users_org_email_unique").on(t.orgId, t.email),
    rolesNonEmpty: check(
      "users_roles_non_empty",
      sql`cardinality(${t.roles}) > 0`,
    ),
  }),
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
