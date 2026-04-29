import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Lightweight rate-limit ledger. In-memory plus DB so we can both throttle
// repeat offenders and audit locks. Pruned periodically by a startup job.
export const loginAttemptsTable = pgTable(
  "login_attempts",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    ip: text("ip").notNull(),
    success: text("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIpIdx: index("login_attempts_email_ip_idx").on(t.email, t.ip),
    createdIdx: index("login_attempts_created_idx").on(t.createdAt),
  }),
);

export type LoginAttempt = typeof loginAttemptsTable.$inferSelect;
export type InsertLoginAttempt = typeof loginAttemptsTable.$inferInsert;
