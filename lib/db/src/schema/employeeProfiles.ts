import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const employeeProfilesTable = pgTable(
  "employee_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    employeeNumber: text("employee_number"),
    costCenter: text("cost_center"),
    defaultPolicy: text("default_policy"),
    defaultGlAccount: text("default_gl_account"),
    mileageRateOverride: text("mileage_rate_override"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    userIdUnique: uniqueIndex("employee_profiles_user_id_unique").on(t.userId),
  }),
);

export type EmployeeProfile = typeof employeeProfilesTable.$inferSelect;
export type InsertEmployeeProfile = typeof employeeProfilesTable.$inferInsert;
