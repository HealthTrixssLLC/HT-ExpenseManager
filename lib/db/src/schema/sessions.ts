import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const sessionsTable = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    // SHA-256 of the random session token. The raw token is only sent to the
    // client once, in the Set-Cookie header.
    tokenHash: text("token_hash").notNull(),
    csrfToken: text("csrf_token").notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    // How this session was created — "password" for local sign-in,
    // "microsoft" for federated. Drives whether sign-out hits the IdP's
    // end-session endpoint. Stored on the session (not the user) so that
    // alternating sign-in methods on the same account behave correctly.
    authMethod: text("auth_method").notNull().default("password"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Absolute expiry, 7 days from creation.
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    userIdIdx: index("sessions_user_id_idx").on(t.userId),
  }),
);

export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
