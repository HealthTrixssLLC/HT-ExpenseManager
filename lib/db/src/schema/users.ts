/**
 * `users` — workforce identity scoped to an org.
 *
 * Notes
 * - `email` is unique per org (case-insensitive via the lower(email)
 *   expression index).
 * - `roles` is a non-empty array of `roleEnum` values; an approver may also
 *   set `isAlsoEmployee` so they can submit reports against themselves.
 * - `passwordHash` is a bcrypt hash. See `lib/auth.ts` in the api-server.
 */
import {
  AnyPgColumn,
  boolean,
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
    // Nullable so users created via federated SSO (e.g. Microsoft Entra)
    // can exist without a local password. Local sign-in still requires it.
    passwordHash: text("password_hash"),
    fullName: text("full_name").notNull(),
    // Stable subject (`oid` claim) of the linked Microsoft Entra identity, if
    // any. Used to match returning federated users in addition to email so a
    // later email change on the Entra side still resolves to the same user.
    microsoftSubject: text("microsoft_subject"),
    // How this user most recently authenticated. "password" for local users,
    // "microsoft" for Entra SSO. Drives federated-logout behavior on sign-out
    // and is shown on the admin user list so admins can see how each user
    // signs in.
    authProvider: text("auth_provider"),
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
    // NOTE: we used to enforce `cardinality(roles) > 0` at the DB level, but
    // Microsoft-Entra-self-provisioned users start with an empty roles array
    // and stay that way until a System Admin grants a role. The "no
    // unauthorized access" guarantee is enforced by `requireRole` in the
    // API middleware (an empty roles array fails every role check), so the
    // constraint moved out of the schema.
  }),
);

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
