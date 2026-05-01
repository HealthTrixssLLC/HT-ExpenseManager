import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orgsTable } from "./orgs";
import { expenseReportsTable } from "./reports";
import {
  qboConnectionHealthEnum,
  qboConnectionModeEnum,
  qboConnectionStatusEnum,
  qboEnvironmentEnum,
  qboPostingStatusEnum,
} from "./enums";

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
    // Whether this org is connected via the demo stub or real Intuit OAuth.
    mode: qboConnectionModeEnum("mode").notNull().default("stub"),
    // Real-OAuth env (sandbox / production). Stub-only orgs default to sandbox.
    environment: qboEnvironmentEnum("environment").notNull().default("sandbox"),
    // Encrypted blobs (AES-256-GCM, base64 of iv|tag|ciphertext).
    clientIdEncrypted: text("client_id_encrypted"),
    clientSecretEncrypted: text("client_secret_encrypted"),
    accessTokenEncrypted: text("access_token_encrypted"),
    refreshTokenEncrypted: text("refresh_token_encrypted"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    lastTokenRefreshAt: timestamp("last_token_refresh_at", {
      withTimezone: true,
    }),
    lastTokenRefreshError: text("last_token_refresh_error"),
    connectionHealth: qboConnectionHealthEnum("connection_health")
      .notNull()
      .default("disconnected"),
    // Posting preferences.
    autoPostOnApproval: boolean("auto_post_on_approval").notNull().default(false),
    defaultMemoTemplate: text("default_memo_template"),
    defaultPayableAccountId: text("default_payable_account_id"),
    defaultPayableAccountName: text("default_payable_account_name"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    lastSuccessfulPostAt: timestamp("last_successful_post_at", {
      withTimezone: true,
    }),
    lastFailedPostAt: timestamp("last_failed_post_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    orgUnique: uniqueIndex("qbo_connection_org_unique").on(t.orgId),
  }),
);

// Tracks one-time OAuth state values issued by /admin/qbo/oauth/start so the
// callback can verify the request came from us.
export const qboOauthStatesTable = pgTable(
  "qbo_oauth_states",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    createdById: uuid("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => ({
    stateUnique: uniqueIndex("qbo_oauth_states_state_unique").on(t.state),
    orgIdx: index("qbo_oauth_states_org_idx").on(t.orgId),
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
  // Internal stub journalId; for real connections this mirrors qboJournalId.
  journalId: text("journal_id").notNull(),
  // Real Intuit JournalEntry Id (when really connected).
  qboJournalId: text("qbo_journal_id"),
  qboSyncToken: text("qbo_sync_token"),
  // Snapshot of the environment + realmId AT POSTING TIME. We persist these
  // on each row so the history-pane deep-links keep pointing at the original
  // QBO tenant even if the org later disconnects, switches sandbox <-> prod,
  // or reconnects to a different realm. Sandbox is the default for stub
  // postings; the realmId stays null for stub mode.
  environment: qboEnvironmentEnum("environment").notNull().default("sandbox"),
  realmId: text("realm_id"),
  attachableIds: jsonb("attachable_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  tagsSent: jsonb("tags_sent")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  payload: jsonb("payload").notNull(),
  status: qboPostingStatusEnum("status").notNull().default("posted"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Org-scoped tag definitions that finance can apply to reports and have
// pushed to QBO journal entries.
export const qboTagsTable = pgTable(
  "qbo_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
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
    orgNameUnique: uniqueIndex("qbo_tags_org_name_unique").on(t.orgId, t.name),
  }),
);

// Many-to-many join: tags applied to a specific expense report.
export const qboTagAssignmentsTable = pgTable(
  "qbo_tag_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    reportId: uuid("report_id")
      .notNull()
      .references(() => expenseReportsTable.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => qboTagsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    reportTagUnique: uniqueIndex("qbo_tag_assignments_report_tag_unique").on(
      t.reportId,
      t.tagId,
    ),
    reportIdx: index("qbo_tag_assignments_report_idx").on(t.reportId),
  }),
);

// Cached QBO chart-of-accounts entries (10-min TTL enforced by service layer).
export const qboAccountsCacheTable = pgTable(
  "qbo_accounts_cache",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    qboAccountId: text("qbo_account_id").notNull(),
    name: text("name").notNull(),
    fullyQualifiedName: text("fully_qualified_name").notNull(),
    accountType: text("account_type").notNull(),
    accountSubType: text("account_sub_type"),
    classification: text("classification"),
    active: boolean("active").notNull().default(true),
    syncToken: text("sync_token"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgAccountUnique: uniqueIndex("qbo_accounts_cache_org_account_unique").on(
      t.orgId,
      t.qboAccountId,
    ),
    orgIdx: index("qbo_accounts_cache_org_idx").on(t.orgId),
  }),
);

// Lightweight rolling log of token-refresh outcomes for the Connection
// Health panel. Persisted so admins can see the last few attempts even
// across server restarts.
export const qboTokenRefreshLogTable = pgTable(
  "qbo_token_refresh_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgsTable.id, { onDelete: "cascade" }),
    success: boolean("success").notNull(),
    errorMessage: text("error_message"),
    expiresInSeconds: integer("expires_in_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    orgIdx: index("qbo_token_refresh_log_org_idx").on(
      t.orgId,
      t.createdAt,
    ),
  }),
);

export type QboConnection = typeof qboConnectionTable.$inferSelect;
export type InsertQboConnection = typeof qboConnectionTable.$inferInsert;
export type QboPostingEvent = typeof qboPostingEventsTable.$inferSelect;
export type InsertQboPostingEvent =
  typeof qboPostingEventsTable.$inferInsert;
export type QboTag = typeof qboTagsTable.$inferSelect;
export type InsertQboTag = typeof qboTagsTable.$inferInsert;
export type QboTagAssignment = typeof qboTagAssignmentsTable.$inferSelect;
export type InsertQboTagAssignment =
  typeof qboTagAssignmentsTable.$inferInsert;
export type QboAccountCache = typeof qboAccountsCacheTable.$inferSelect;
export type InsertQboAccountCache =
  typeof qboAccountsCacheTable.$inferInsert;
export type QboOauthState = typeof qboOauthStatesTable.$inferSelect;
export type InsertQboOauthState = typeof qboOauthStatesTable.$inferInsert;
export type QboTokenRefreshLog = typeof qboTokenRefreshLogTable.$inferSelect;
export type InsertQboTokenRefreshLog =
  typeof qboTokenRefreshLogTable.$inferInsert;
