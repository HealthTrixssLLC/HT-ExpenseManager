/**
 * QuickBooks Online integration service.
 *
 * This module supports two modes per org:
 *
 *  - "stub" mode (default): the connection is simulated. JournalEntry
 *    payloads are still constructed, persisted to `qbo_posting_events`, and
 *    surfaced to finance, but no real Intuit API calls are made. This keeps
 *    the public demo working without configured Intuit credentials.
 *
 *  - "real" mode: the org has a stored Intuit Client ID + Secret and has
 *    completed the OAuth dance. We then talk to the Intuit Accounting API:
 *    JournalEntry posting, Attachable upload for receipts, CompanyInfo
 *    fetch, and Chart of Accounts fetch (cached).
 *
 * Mode detection is per-request: `resolveMode(orgId)` looks at the row.
 *
 * All credential blobs (clientId, clientSecret, access/refresh tokens) are
 * encrypted at rest via `lib/encryption.ts`. The plaintext only ever lives
 * in process memory long enough to call Intuit, then is discarded.
 */

import { customAlphabet } from "nanoid";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";
import {
  db,
  expenseReportsTable,
  glMappingsTable,
  lineItemsTable,
  orgsTable,
  qboAccountsCacheTable,
  qboConnectionTable,
  qboOauthStatesTable,
  qboPostingEventsTable,
  qboTagAssignmentsTable,
  qboTagsTable,
  qboTokenRefreshLogTable,
  qboVendorCacheTable,
  receiptsTable,
  usersTable,
  type ExpenseReport,
  type QboConnection,
  type QboEnvironment,
  type Role,
} from "@workspace/db";
import {
  decryptNullable,
  decryptString,
  encryptionAvailable,
  encryptString,
} from "../lib/encryption";
import { ObjectStorageService } from "../lib/objectStorage";
import {
  buildAuthorizationUrl,
  createIntuitAccountingClient,
  describeIntuitError,
  exchangeCodeForTokens,
  INTUIT_DISCOVERY,
  IntuitApiError,
  refreshAccessToken,
  revokeToken,
  type IntuitAccountingClient,
  type IntuitTokenResponse,
} from "./intuitClient";
import { isDevDomainRedirect } from "./qboRedirect";
import { recordAudit } from "./audit";
import { logger } from "../lib/logger";

const NANOID = customAlphabet("0123456789ABCDEFGHJKMNPQRSTVWXYZ", 8);
const REALM_NANOID = customAlphabet("0123456789", 16);

const FALLBACK_ACCOUNT = "Uncategorized Expense";
const PAYABLE_ACCOUNT = "Employee Reimbursement Payable";
const CURRENCY = "USD";
const ACCOUNTS_CACHE_TTL_MS = 10 * 60 * 1000;

export type GlPreviewLineEntity = {
  /** Intuit accepts Vendor or Employee on AP/AR lines. We use Vendor. */
  type: "Vendor" | "Employee";
  refValue: string;
  refName: string;
};

export type GlPreviewLine = {
  account: string;
  /**
   * Durable QBO Chart-of-Accounts Id for this line, when the GL mapping has
   * been linked to a real QBO account. The posting payload prefers this over
   * the human-readable name because Intuit's API matches by Id, and the name
   * could change in QBO without our knowledge.
   */
  accountId: string | null;
  /**
   * Cached QBO AccountType for `accountId` (e.g. "Accounts Payable",
   * "Expense"). Populated from `qbo_accounts_cache` when available. We
   * use this to decide whether the JournalEntry line needs an Entity
   * reference — Intuit requires Entity on every line whose AccountRef
   * targets an A/P or A/R account.
   */
  accountType?: string | null;
  category: string;
  amount: string;
  /**
   * Entity reference (Vendor/Employee) attached to this line on the
   * wire. Populated by `postReportToQboReal` for AP/AR lines from the
   * report submitter via `resolveSubmitterVendor`. Null in stub mode
   * and on lines that don't need an entity.
   */
  entity?: GlPreviewLineEntity | null;
};

/** AccountType values that Intuit requires an Entity reference on. */
export const ENTITY_REQUIRED_ACCOUNT_TYPES: ReadonlySet<string> = new Set([
  "Accounts Payable",
  "Accounts Receivable",
]);

export function lineRequiresEntity(line: GlPreviewLine): boolean {
  return Boolean(
    line.accountType && ENTITY_REQUIRED_ACCOUNT_TYPES.has(line.accountType),
  );
}

export type GlPreview = {
  reportId: string;
  displayCode: string;
  journalDate: string;
  memo: string;
  debits: GlPreviewLine[];
  credits: GlPreviewLine[];
  totalDebits: string;
  totalCredits: string;
  currency: string;
};

function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${(abs % 100).toString().padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function buildGlPreview(
  report: ExpenseReport,
): Promise<GlPreview> {
  const [lines, mappings, conn] = await Promise.all([
    db
      .select()
      .from(lineItemsTable)
      .where(eq(lineItemsTable.reportId, report.id)),
    db
      .select()
      .from(glMappingsTable)
      .where(eq(glMappingsTable.orgId, report.orgId)),
    db
      .select()
      .from(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, report.orgId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  // Account-type lookup from the cached chart of accounts. Used to flag
  // AP/AR lines that require an Entity reference at post time. We don't
  // force-refresh here because account_type rarely changes for an existing
  // QBO account Id; in real-mode posting, postReportToQboReal calls
  // ensureAccountTypesForLines before evaluating Entity attachment so a
  // cold or stale cache cannot cause us to ship an AP/AR line without
  // its required Entity block.
  const cachedAccounts = await db
    .select({
      qboAccountId: qboAccountsCacheTable.qboAccountId,
      name: qboAccountsCacheTable.name,
      accountType: qboAccountsCacheTable.accountType,
      active: qboAccountsCacheTable.active,
    })
    .from(qboAccountsCacheTable)
    .where(eq(qboAccountsCacheTable.orgId, report.orgId));
  const accountTypeById = new Map(
    cachedAccounts.map((a) => [a.qboAccountId, a.accountType] as const),
  );

  const accountByCategory = new Map(
    mappings.map((m) => [
      m.code,
      { name: m.qboAccount, id: m.qboAccountId ?? null },
    ] as const),
  );

  // One debit line per category total (preserves category-level fidelity).
  const debitsByCategory = new Map<string, number>();
  let totalCents = 0;
  for (const line of lines) {
    const cents = Math.round(parseFloat(line.amount) * 100);
    totalCents += cents;
    debitsByCategory.set(
      line.category,
      (debitsByCategory.get(line.category) ?? 0) + cents,
    );
  }

  const debits: GlPreviewLine[] = [...debitsByCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, cents]) => {
      const acc = accountByCategory.get(category);
      const accountId = acc?.id ?? null;
      return {
        account: acc?.name ?? FALLBACK_ACCOUNT,
        accountId,
        accountType: accountId ? accountTypeById.get(accountId) ?? null : null,
        category,
        amount: centsToDecimal(cents),
        entity: null,
      };
    });

  // Resolve the payable (credit) account. If the connection has no
  // defaultPayableAccountId set yet, fall back to the org's first active
  // Accounts Payable account from the cached chart of accounts. This makes
  // GL preview deterministic for newly-connected orgs that haven't picked
  // a default in the admin UI yet, and is the read-side mirror of the
  // auto-resolve-and-persist step that postReportToQboReal performs before
  // posting (so the credit line on the wire always carries an Account Id).
  let payableName = conn?.defaultPayableAccountName ?? PAYABLE_ACCOUNT;
  let payableId = conn?.defaultPayableAccountId ?? null;
  if (!payableId) {
    const fallback = pickDefaultPayableFromCachedAccounts(cachedAccounts);
    if (fallback) {
      payableId = fallback.qboAccountId;
      payableName = fallback.name;
    }
  }

  const credits: GlPreviewLine[] = [
    {
      account: payableName,
      accountId: payableId,
      accountType: payableId ? accountTypeById.get(payableId) ?? null : null,
      category: payableName,
      amount: centsToDecimal(totalCents),
      entity: null,
    },
  ];

  const memoTemplate =
    conn?.defaultMemoTemplate ??
    "Healthtrix Expense — {displayCode} — {title}";
  const memo = memoTemplate
    .replace("{displayCode}", report.displayCode)
    .replace("{title}", report.title);

  return {
    reportId: report.id,
    displayCode: report.displayCode,
    journalDate: todayIso(),
    memo,
    debits,
    credits,
    totalDebits: centsToDecimal(totalCents),
    totalCredits: centsToDecimal(totalCents),
    currency: CURRENCY,
  };
}

// ---------------------------------------------------------------------------
// Connection row helpers
// ---------------------------------------------------------------------------

export async function ensureConnectionRow(orgId: string): Promise<QboConnection> {
  const existing = (
    await db
      .select()
      .from(qboConnectionTable)
      .where(eq(qboConnectionTable.orgId, orgId))
      .limit(1)
  )[0];
  if (existing) return existing;
  const [created] = await db
    .insert(qboConnectionTable)
    .values({ orgId })
    .returning();
  return created;
}

/** Returns "real" if the org has stored encrypted client credentials, else "stub". */
export function hasRealCredentials(conn: QboConnection): boolean {
  return Boolean(conn.clientIdEncrypted && conn.clientSecretEncrypted);
}

/** Returns "real" iff has tokens AND credentials. */
export function isRealConnected(conn: QboConnection): boolean {
  return (
    hasRealCredentials(conn) &&
    Boolean(conn.accessTokenEncrypted) &&
    Boolean(conn.refreshTokenEncrypted) &&
    conn.status === "connected" &&
    conn.mode === "real"
  );
}

// ---------------------------------------------------------------------------
// Stub flow (kept for demo orgs).
// ---------------------------------------------------------------------------

export async function connectQboStub(orgId: string): Promise<QboConnection> {
  const [org] = await db
    .select({ name: orgsTable.name })
    .from(orgsTable)
    .where(eq(orgsTable.id, orgId))
    .limit(1);
  if (!org) {
    throw new Error(`Org ${orgId} not found while connecting QuickBooks stub`);
  }
  const realmId = REALM_NANOID();
  const companyName = `${org.name} · Sandbox`;
  await ensureConnectionRow(orgId);
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      status: "connected",
      mode: "stub",
      environment: "sandbox",
      realmId,
      companyName,
      connectedAt: new Date(),
      lastSyncError: null,
      connectionHealth: "healthy",
    })
    .where(eq(qboConnectionTable.orgId, orgId))
    .returning();
  return updated;
}

export async function disconnectQboStub(orgId: string): Promise<QboConnection> {
  await ensureConnectionRow(orgId);
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      status: "disconnected",
      mode: "stub",
      realmId: null,
      companyName: null,
      connectedAt: null,
      connectionHealth: "disconnected",
    })
    .where(eq(qboConnectionTable.orgId, orgId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Real OAuth flow
// ---------------------------------------------------------------------------

export type SaveCredentialsInput = {
  orgId: string;
  environment: QboEnvironment;
  clientId?: string | null; // null/undefined keeps existing
  clientSecret?: string | null;
};

/** Persist (encrypt) the org's Intuit Client ID + Secret + chosen environment. */
export async function saveQboCredentials(
  args: SaveCredentialsInput,
): Promise<QboConnection> {
  if (
    (args.clientId !== undefined && args.clientId !== null && !encryptionAvailable()) ||
    (args.clientSecret !== undefined && args.clientSecret !== null && !encryptionAvailable())
  ) {
    throw new Error(
      "Cannot save QBO credentials: QBO_CREDENTIAL_ENCRYPTION_KEY is not configured.",
    );
  }
  const conn = await ensureConnectionRow(args.orgId);
  const updates: Partial<typeof qboConnectionTable.$inferInsert> = {
    environment: args.environment,
  };
  if (typeof args.clientId === "string" && args.clientId.length > 0) {
    updates.clientIdEncrypted = encryptString(args.clientId);
  } else if (args.clientId === null) {
    updates.clientIdEncrypted = null;
  }
  if (typeof args.clientSecret === "string" && args.clientSecret.length > 0) {
    updates.clientSecretEncrypted = encryptString(args.clientSecret);
  } else if (args.clientSecret === null) {
    updates.clientSecretEncrypted = null;
  }
  // If credentials are now configured AND we have no live tokens yet, set
  // mode=real but keep status=disconnected so the UI shows "ready to connect".
  // Note: a key set to null in `updates` represents an explicit clear, so we
  // can't use `??` (which would fall through to the existing value).
  const nextClientId =
    "clientIdEncrypted" in updates ? updates.clientIdEncrypted : conn.clientIdEncrypted;
  const nextClientSecret =
    "clientSecretEncrypted" in updates
      ? updates.clientSecretEncrypted
      : conn.clientSecretEncrypted;
  const willHaveCreds = Boolean(nextClientId) && Boolean(nextClientSecret);
  if (willHaveCreds && !conn.accessTokenEncrypted) {
    updates.mode = "real";
  }
  // If credentials are being CLEARED, also drop any stored tokens / realm /
  // company name and reset the connection to a clean disconnected/stub
  // state. Otherwise we'd leave behind tokens that no longer match a
  // configured client app, plus a misleading mode/status combination.
  if (!willHaveCreds) {
    updates.accessTokenEncrypted = null;
    updates.refreshTokenEncrypted = null;
    updates.tokenExpiresAt = null;
    updates.refreshTokenExpiresAt = null;
    updates.realmId = null;
    updates.companyName = null;
    updates.mode = "stub";
    updates.status = "disconnected";
    updates.connectionHealth = "disconnected";
    updates.lastTokenRefreshError = null;
    updates.lastSyncError = null;
  }
  const [updated] = await db
    .update(qboConnectionTable)
    .set(updates)
    .where(eq(qboConnectionTable.orgId, args.orgId))
    .returning();
  return updated;
}

export type SavePostingPreferencesInput = {
  orgId: string;
  autoPostOnApproval?: boolean;
  defaultMemoTemplate?: string | null;
  defaultPayableAccountId?: string | null;
  defaultPayableAccountName?: string | null;
};

export async function savePostingPreferences(
  args: SavePostingPreferencesInput,
): Promise<QboConnection> {
  const before = await ensureConnectionRow(args.orgId);
  const updates: Partial<typeof qboConnectionTable.$inferInsert> = {};
  if (args.autoPostOnApproval !== undefined) {
    updates.autoPostOnApproval = args.autoPostOnApproval;
  }
  if (args.defaultMemoTemplate !== undefined) {
    updates.defaultMemoTemplate = args.defaultMemoTemplate;
  }
  if (args.defaultPayableAccountId !== undefined) {
    updates.defaultPayableAccountId = args.defaultPayableAccountId;
  }
  if (args.defaultPayableAccountName !== undefined) {
    updates.defaultPayableAccountName = args.defaultPayableAccountName;
  }
  const [updated] = await db
    .update(qboConnectionTable)
    .set(updates)
    .where(eq(qboConnectionTable.orgId, args.orgId))
    .returning();
  // When the default payable account is set or changed, eagerly refresh
  // the cached chart of accounts so its accountType is known on the very
  // first post after configuration. Without this, the cold-cache window
  // could hide the AP classification, and AP/AR detection would silently
  // skip attaching the required Entity block — reproducing the
  // "Required param missing" Fault from Intuit.
  const payableChanged =
    args.defaultPayableAccountId !== undefined &&
    args.defaultPayableAccountId !== null &&
    args.defaultPayableAccountId !== before.defaultPayableAccountId;
  if (payableChanged && isRealConnected(updated)) {
    try {
      await listChartOfAccounts({ orgId: args.orgId, forceRefresh: true });
    } catch (err) {
      logger.warn(
        { err, orgId: args.orgId },
        "Failed to refresh QBO chart of accounts after default payable account change; cache will refresh on next post",
      );
    }
  }
  return updated;
}

// ---------------------------------------------------------------------------
// Preflight: dry-run validation of the org's QBO setup before OAuth.
// ---------------------------------------------------------------------------

export type QboPreflightCheckStatus = "pass" | "warn" | "fail";

export type QboPreflightCheck = {
  id: string;
  label: string;
  status: QboPreflightCheckStatus;
  detail?: string | null;
};

export type QboPreflightResult = {
  encryptionKeyConfigured: boolean;
  resolvedRedirectUri: string;
  environment: QboEnvironment;
  checks: QboPreflightCheck[];
};

/**
 * Run a non-destructive validation of an org's QBO configuration. Designed
 * to be safe to call from the admin UI's "Test configuration" button — does
 * NOT mutate any DB row, does NOT trigger an OAuth handshake, and only
 * makes outbound HTTP calls to Intuit's well-known discovery / token
 * endpoints (with a deliberately invalid grant for the Client ID probe).
 */
export async function runQboPreflight(args: {
  orgId: string;
  resolvedRedirectUri: string;
  /**
   * If the deployment was unable to resolve a redirect URI at all (e.g.
   * production without QBO_OAUTH_REDIRECT_URI set), the route may pass an
   * actionable message here. The preflight then surfaces it as a `fail`
   * row on the `redirect_uri` check instead of pretending the empty string
   * is a valid value.
   */
  redirectError?: string | null;
  fetchFn?: typeof fetch;
}): Promise<QboPreflightResult> {
  const fetchImpl = args.fetchFn ?? fetch;
  const conn = await ensureConnectionRow(args.orgId);
  const checks: QboPreflightCheck[] = [];
  const keyConfigured = encryptionAvailable();

  checks.push({
    id: "encryption_key",
    label: "Encryption key (QBO_CREDENTIAL_ENCRYPTION_KEY) is configured",
    status: keyConfigured ? "pass" : "fail",
    detail: keyConfigured
      ? null
      : "Set QBO_CREDENTIAL_ENCRYPTION_KEY on the server before saving credentials.",
  });

  // Decryption probe: try to round-trip the stored Client ID/Secret through
  // the encryption module. This catches the "key was rotated since save"
  // case where the row is non-empty but the ciphertext can no longer be
  // decoded with the current key.
  let decryptedClientId: string | null = null;
  if (!conn.clientIdEncrypted && !conn.clientSecretEncrypted) {
    checks.push({
      id: "stored_credentials",
      label: "Stored Client ID and Client Secret are decryptable",
      status: "warn",
      detail:
        "No credentials stored yet. Save your Intuit Client ID and Client Secret above first.",
    });
  } else if (!keyConfigured) {
    checks.push({
      id: "stored_credentials",
      label: "Stored Client ID and Client Secret are decryptable",
      status: "fail",
      detail:
        "Cannot decrypt without QBO_CREDENTIAL_ENCRYPTION_KEY. Set the env var, then re-save credentials.",
    });
  } else {
    try {
      decryptedClientId = decryptString(conn.clientIdEncrypted!);
      if (conn.clientSecretEncrypted) decryptString(conn.clientSecretEncrypted);
      checks.push({
        id: "stored_credentials",
        label: "Stored Client ID and Client Secret are decryptable",
        status: "pass",
        detail: null,
      });
    } catch (err) {
      decryptedClientId = null;
      checks.push({
        id: "stored_credentials",
        label: "Stored Client ID and Client Secret are decryptable",
        status: "fail",
        detail:
          "Stored credentials cannot be decrypted with the current QBO_CREDENTIAL_ENCRYPTION_KEY. Re-save Client ID/Secret to fix.",
      });
    }
  }

  // Best-effort reachability ping for the Intuit environment endpoints. We
  // hit the token endpoint with HEAD so we don't need a real grant — any
  // non-network response (including 4xx) means Intuit is reachable.
  const env = INTUIT_DISCOVERY[conn.environment];
  try {
    const res = await fetchImpl(env.tokenEndpoint, { method: "HEAD" });
    checks.push({
      id: "environment_reachable",
      label: `Intuit ${conn.environment} environment is reachable`,
      status: "pass",
      detail: `${env.tokenEndpoint} responded with HTTP ${res.status}.`,
    });
  } catch (err) {
    checks.push({
      id: "environment_reachable",
      label: `Intuit ${conn.environment} environment is reachable`,
      status: "fail",
      detail: `Could not reach ${env.tokenEndpoint}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
  }

  // Redirect URI surfacing. If the deployment couldn't resolve a URI at
  // all (production without QBO_OAUTH_REDIRECT_URI), we flip this row to
  // `fail` with the actionable error from the route. Otherwise we pass
  // and surface the exact string the server will send so the admin can
  // diff it against Intuit's keys tab.
  if (args.redirectError) {
    checks.push({
      id: "redirect_uri",
      label: "OAuth redirect URI is configured",
      status: "fail",
      detail: args.redirectError,
    });
  } else {
    checks.push({
      id: "redirect_uri",
      label: "OAuth redirect URI is resolved",
      status: "pass",
      detail: `This is the exact value the server will send to Intuit. It must be registered character-for-character on developer.intuit.com → Keys & OAuth → Redirect URIs (${conn.environment === "production" ? "Production" : "Development"} keys tab): ${args.resolvedRedirectUri}`,
    });

    // Environment-vs-URI mismatch warning. Intuit checks redirect URIs
    // separately for Sandbox (Development keys) and Production keys, so
    // a production org pointing at a *.replit.dev URI (or vice versa)
    // will be rejected at authorize time even though both look valid.
    const looksLikeDev = isDevDomainRedirect(args.resolvedRedirectUri);
    if (conn.environment === "production" && looksLikeDev) {
      checks.push({
        id: "redirect_uri_environment_match",
        label: "Redirect URI matches the configured QBO environment",
        status: "warn",
        detail:
          "The org is configured for Production but the resolved redirect URI is a *.replit.dev dev domain. Intuit's Production keys tab will reject this URI. Set QBO_OAUTH_REDIRECT_URI to the public production URL registered on Intuit.",
      });
    } else if (conn.environment === "sandbox" && !looksLikeDev) {
      // Soft signal — sandbox usually uses a dev domain, but a deployed
      // staging environment could legitimately use a stable host. Warn,
      // don't fail.
      checks.push({
        id: "redirect_uri_environment_match",
        label: "Redirect URI matches the configured QBO environment",
        status: "warn",
        detail:
          "The org is configured for Sandbox but the resolved redirect URI is not a *.replit.dev dev domain. Make sure this exact URI is registered on Intuit's Development keys tab (not just Production).",
      });
    }
  }

  // Optional Client ID probe. Intuit's token endpoint distinguishes:
  //   invalid_client  → Client ID/Secret pair is not recognized
  //   invalid_grant   → app is recognized but the grant is bad (expected!)
  // We deliberately send a bogus authorization_code so a healthy app
  // returns invalid_grant. Anything that returns invalid_client tells us
  // the stored Client ID is wrong / typo'd / from a deleted Intuit app.
  if (decryptedClientId && conn.clientSecretEncrypted && keyConfigured) {
    let clientSecret = "";
    try {
      clientSecret = decryptString(conn.clientSecretEncrypted);
    } catch {
      /* already reported as fail above */
    }
    if (clientSecret) {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code: "preflight-invalid-grant-probe",
          redirect_uri: args.resolvedRedirectUri,
        });
        const res = await fetchImpl(env.tokenEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${decryptedClientId}:${clientSecret}`,
            ).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: body.toString(),
        });
        const text = await res.text().catch(() => "");
        if (/invalid_client/i.test(text)) {
          checks.push({
            id: "client_id_recognized",
            label: "Intuit recognizes the stored Client ID",
            status: "fail",
            detail:
              "Intuit returned invalid_client. The stored Client ID/Secret pair is not registered with this app on developer.intuit.com (wrong environment? typo? app deleted?).",
          });
        } else if (/invalid_grant/i.test(text) || res.status === 400) {
          checks.push({
            id: "client_id_recognized",
            label: "Intuit recognizes the stored Client ID",
            status: "pass",
            detail:
              "Intuit accepted the Client ID (returned invalid_grant for the preflight probe, which is expected).",
          });
        } else {
          checks.push({
            id: "client_id_recognized",
            label: "Intuit recognizes the stored Client ID",
            status: "warn",
            detail: `Intuit returned HTTP ${res.status} (no invalid_client / invalid_grant marker). Could not confirm Client ID.`,
          });
        }
      } catch (err) {
        checks.push({
          id: "client_id_recognized",
          label: "Intuit recognizes the stored Client ID",
          status: "warn",
          detail: `Could not probe Intuit: ${
            err instanceof Error ? err.message : String(err)
          }`,
        });
      }
    }
  }

  return {
    encryptionKeyConfigured: keyConfigured,
    resolvedRedirectUri: args.resolvedRedirectUri,
    environment: conn.environment,
    checks,
  };
}

/** Build the Intuit authorization URL and persist a one-time state. */
export async function startQboOauth(args: {
  orgId: string;
  userId: string;
  redirectUri: string;
}): Promise<{ url: string; state: string }> {
  const conn = await ensureConnectionRow(args.orgId);
  if (!hasRealCredentials(conn)) {
    throw new Error(
      "QBO credentials are not configured. Save Client ID and Client Secret first.",
    );
  }
  const clientId = decryptString(conn.clientIdEncrypted!);
  const state = `${NANOID()}${NANOID()}${NANOID()}`;
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  await db.insert(qboOauthStatesTable).values({
    orgId: args.orgId,
    state,
    createdById: args.userId,
    expiresAt,
  });
  const url = buildAuthorizationUrl({
    environment: conn.environment,
    clientId,
    redirectUri: args.redirectUri,
    state,
  });
  return { url, state };
}

export type OauthCallbackResult = {
  ok: boolean;
  errorMessage?: string;
  conn?: QboConnection;
};

/**
 * Handle the OAuth callback: exchange code, persist tokens, fetch CompanyInfo.
 * The `state` value is an opaque nonce — the orgId (and the user who initiated
 * the flow) are resolved server-side from the qbo_oauth_states row. Callers
 * MUST NOT pass orgId from the front-channel.
 */
export async function handleQboOauthCallback(args: {
  state: string;
  code: string;
  realmId: string;
  redirectUri: string;
  fetchFn?: typeof fetch;
}): Promise<OauthCallbackResult> {
  const stateRow = (
    await db
      .select()
      .from(qboOauthStatesTable)
      .where(eq(qboOauthStatesTable.state, args.state))
      .limit(1)
  )[0];
  if (!stateRow) {
    return { ok: false, errorMessage: "Invalid or unknown OAuth state." };
  }
  if (stateRow.consumedAt) {
    return { ok: false, errorMessage: "OAuth state has already been used." };
  }
  if (stateRow.expiresAt.getTime() < Date.now()) {
    return { ok: false, errorMessage: "OAuth state has expired. Please retry the connect flow." };
  }
  await db
    .update(qboOauthStatesTable)
    .set({ consumedAt: new Date() })
    .where(eq(qboOauthStatesTable.id, stateRow.id));

  const orgId = stateRow.orgId;
  const initiatorUserId = stateRow.createdById;
  const conn = await ensureConnectionRow(orgId);
  if (!hasRealCredentials(conn)) {
    return {
      ok: false,
      errorMessage: "QBO credentials are not configured for this org.",
    };
  }
  const clientId = decryptString(conn.clientIdEncrypted!);
  const clientSecret = decryptString(conn.clientSecretEncrypted!);

  let tokens: IntuitTokenResponse;
  try {
    tokens = await exchangeCodeForTokens({
      environment: conn.environment,
      clientId,
      clientSecret,
      redirectUri: args.redirectUri,
      code: args.code,
      fetchFn: args.fetchFn,
    });
  } catch (err) {
    return { ok: false, errorMessage: describeIntuitError(err) };
  }

  // Probe CompanyInfo so we can store the human-readable company name.
  let companyName = "";
  try {
    const client = createIntuitAccountingClient({
      environment: conn.environment,
      clientId,
      clientSecret,
      realmId: args.realmId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      fetchFn: args.fetchFn,
    });
    const info = await client.fetchCompanyInfo();
    companyName = info.companyName;
  } catch (err) {
    logger.warn(
      { err, orgId },
      "Could not fetch CompanyInfo after OAuth; storing tokens anyway",
    );
  }

  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
  const refreshExpiresAt = new Date(
    now.getTime() + tokens.x_refresh_token_expires_in * 1000,
  );
  const finalCompanyName = companyName || `Intuit · ${args.realmId}`;
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      status: "connected",
      realmId: args.realmId,
      companyName: finalCompanyName,
      accessTokenEncrypted: encryptString(tokens.access_token),
      refreshTokenEncrypted: encryptString(tokens.refresh_token),
      tokenExpiresAt,
      refreshTokenExpiresAt: refreshExpiresAt,
      lastTokenRefreshAt: now,
      lastTokenRefreshError: null,
      connectionHealth: "healthy",
      connectedAt: now,
      lastSyncError: null,
    })
    .where(eq(qboConnectionTable.orgId, orgId))
    .returning();

  // Audit the real connect under qbo_config, attributed to the user who
  // initiated the OAuth flow. Diff captures the user-visible state changes.
  const initiator = (
    await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(eq(usersTable.id, initiatorUserId))
      .limit(1)
  )[0];
  if (initiator) {
    await recordQboAudit({
      orgId,
      actor: { id: initiator.id, roles: initiator.roles as Role[] },
      entityType: "qbo_config",
      entityId: orgId,
      action: "updated",
      fieldDiffs: [
        { field: "mode", before: conn.mode, after: "real" },
        { field: "status", before: conn.status, after: "connected" },
        { field: "environment", before: conn.environment, after: conn.environment },
        { field: "realmId", before: conn.realmId, after: args.realmId },
        { field: "companyName", before: conn.companyName, after: finalCompanyName },
        { field: "connectionHealth", before: conn.connectionHealth, after: "healthy" },
      ],
    });
  } else {
    // Fall back to system-attributed audit if the initiator was somehow
    // deleted between start and callback.
    await recordQboSystemAudit({
      orgId,
      entityType: "qbo_config",
      entityId: orgId,
      action: "updated",
      fieldDiffs: [
        { field: "mode", before: conn.mode, after: "real" },
        { field: "status", before: conn.status, after: "connected" },
        { field: "realmId", before: conn.realmId, after: args.realmId },
        { field: "companyName", before: conn.companyName, after: finalCompanyName },
      ],
    });
  }
  return { ok: true, conn: updated };
}

/**
 * Disconnect: revoke the refresh token at Intuit, then wipe BOTH tokens AND
 * the encrypted Client ID / Client Secret from the row. The row is reset to
 * `mode: "stub"` so the UI is consistent with "no real credentials stored".
 *
 * Admins must re-enter their Intuit Client ID / Secret before they can
 * connect again — this matches the security expectation that disconnecting
 * fully revokes the org's QBO trust, not just the tokens.
 */
export async function disconnectQboReal(args: {
  orgId: string;
  fetchFn?: typeof fetch;
}): Promise<QboConnection> {
  const conn = await ensureConnectionRow(args.orgId);
  if (
    conn.clientIdEncrypted &&
    conn.clientSecretEncrypted &&
    conn.refreshTokenEncrypted
  ) {
    try {
      await revokeToken({
        environment: conn.environment,
        clientId: decryptString(conn.clientIdEncrypted),
        clientSecret: decryptString(conn.clientSecretEncrypted),
        token: decryptString(conn.refreshTokenEncrypted),
        fetchFn: args.fetchFn,
      });
    } catch (err) {
      logger.warn(
        { err, orgId: args.orgId },
        "Intuit token revoke failed; clearing local state anyway",
      );
    }
  }
  const [updated] = await db
    .update(qboConnectionTable)
    .set({
      status: "disconnected",
      mode: "stub",
      // Wipe encrypted credentials in addition to tokens.
      clientIdEncrypted: null,
      clientSecretEncrypted: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      lastTokenRefreshAt: null,
      lastTokenRefreshError: null,
      realmId: null,
      companyName: null,
      connectedAt: null,
      connectionHealth: "disconnected",
    })
    .where(eq(qboConnectionTable.orgId, args.orgId))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Token refresh job
// ---------------------------------------------------------------------------

/** Refresh a single org's tokens if needed. Returns the new conn row. */
export async function refreshOrgTokensIfNeeded(args: {
  orgId: string;
  /** Override "needs refresh" check; useful for manual-refresh button. */
  force?: boolean;
  fetchFn?: typeof fetch;
}): Promise<QboConnection> {
  const conn = await ensureConnectionRow(args.orgId);
  if (
    !conn.refreshTokenEncrypted ||
    !conn.clientIdEncrypted ||
    !conn.clientSecretEncrypted ||
    conn.status !== "connected"
  ) {
    return conn;
  }
  const expiresInMs = conn.tokenExpiresAt
    ? conn.tokenExpiresAt.getTime() - Date.now()
    : 0;
  const oneHour = 60 * 60 * 1000;
  if (!args.force && expiresInMs > oneHour) {
    return conn;
  }
  try {
    const tokens = await refreshAccessToken({
      environment: conn.environment,
      clientId: decryptString(conn.clientIdEncrypted),
      clientSecret: decryptString(conn.clientSecretEncrypted),
      refreshToken: decryptString(conn.refreshTokenEncrypted),
      fetchFn: args.fetchFn,
    });
    const now = new Date();
    const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
    const refreshExpiresAt = new Date(
      now.getTime() + tokens.x_refresh_token_expires_in * 1000,
    );
    const [updated] = await db
      .update(qboConnectionTable)
      .set({
        accessTokenEncrypted: encryptString(tokens.access_token),
        refreshTokenEncrypted: encryptString(tokens.refresh_token),
        tokenExpiresAt,
        refreshTokenExpiresAt: refreshExpiresAt,
        lastTokenRefreshAt: now,
        lastTokenRefreshError: null,
        connectionHealth: "healthy",
      })
      .where(eq(qboConnectionTable.orgId, args.orgId))
      .returning();
    await db.insert(qboTokenRefreshLogTable).values({
      orgId: args.orgId,
      success: true,
      expiresInSeconds: tokens.expires_in,
    });
    return updated;
  } catch (err) {
    const msg = describeIntuitError(err);
    const isRevoked =
      err instanceof IntuitApiError &&
      err.code === "refresh_token_revoked";
    const [updated] = await db
      .update(qboConnectionTable)
      .set({
        lastTokenRefreshAt: new Date(),
        lastTokenRefreshError: msg,
        connectionHealth: isRevoked ? "reconnect_required" : "refresh_failed",
        ...(isRevoked
          ? { status: "error" as const }
          : {}),
      })
      .where(eq(qboConnectionTable.orgId, args.orgId))
      .returning();
    await db.insert(qboTokenRefreshLogTable).values({
      orgId: args.orgId,
      success: false,
      errorMessage: msg,
    });
    // Surface refresh failures in the QBO audit log so admins can see the
    // health change show up in the same view as their other QBO actions.
    // Attributed to a real org admin (system actor) since the audit table
    // requires a non-null actorId.
    await recordQboSystemAudit({
      orgId: args.orgId,
      entityType: "qbo_config",
      entityId: updated.id,
      action: "updated",
      fieldDiffs: [
        {
          field: "connectionHealth",
          before: conn.connectionHealth,
          after: updated.connectionHealth,
        },
        {
          field: "lastTokenRefreshError",
          before: conn.lastTokenRefreshError,
          after: msg,
        },
        ...(isRevoked
          ? [
              {
                field: "status",
                before: conn.status,
                after: "error",
              },
            ]
          : []),
      ],
    });
    return updated;
  }
}

/** Run the refresh sweep across every connected org. */
export async function runTokenRefreshSweep(args?: {
  fetchFn?: typeof fetch;
}): Promise<{ checked: number; refreshed: number; failed: number }> {
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  // Pull every connected real-mode connection whose token is near expiry.
  const rows = await db
    .select()
    .from(qboConnectionTable)
    .where(
      and(
        eq(qboConnectionTable.mode, "real"),
        eq(qboConnectionTable.status, "connected"),
        lte(qboConnectionTable.tokenExpiresAt, oneHourFromNow),
      ),
    );
  let refreshed = 0;
  let failed = 0;
  for (const row of rows) {
    const updated = await refreshOrgTokensIfNeeded({
      orgId: row.orgId,
      force: true,
      ...(args?.fetchFn ? { fetchFn: args.fetchFn } : {}),
    });
    if (updated.connectionHealth === "healthy") refreshed++;
    else failed++;
  }
  return { checked: rows.length, refreshed, failed };
}

// ---------------------------------------------------------------------------
// Posting (real + stub)
// ---------------------------------------------------------------------------

export type PostResult =
  | {
      status: "posted" | "retried";
      journalId: string;
      qboJournalId: string | null;
      qboSyncToken: string | null;
      attachableIds: string[];
      tagsSent: string[];
      payload: Record<string, unknown>;
    }
  | {
      status: "error";
      errorMessage: string;
      payload: Record<string, unknown>;
    };

export type PostOptions = {
  forceSuccess?: boolean;
  /**
   * When true, a successful post is recorded as `status: "retried"` so the
   * Posting History panel can distinguish retries from first-attempt posts.
   * Set by the `/reports/:id/retry-qbo` route.
   */
  retry?: boolean;
  fetchFn?: typeof fetch;
};

export async function postReportToQbo(
  report: ExpenseReport,
  options: PostOptions = {},
): Promise<PostResult> {
  const conn = await ensureConnectionRow(report.orgId);

  // Stub fallback only applies to orgs that have NEVER configured real
  // credentials (demo/sandbox orgs). Once real credentials are stored we
  // never silently downgrade to stub — a degraded real connection (token
  // revoked, status=error, reconnect_required, etc.) must surface as a
  // posting error so finance knows to reconnect, instead of producing a
  // fake "posted" event with no real JournalEntry on the Intuit side.
  if (hasRealCredentials(conn) || conn.mode === "real") {
    if (isRealConnected(conn)) {
      return postReportToQboReal(report, conn, options);
    }
    const errorMessage =
      "QuickBooks connection requires reconnect (status=" +
      conn.status +
      ", health=" +
      conn.connectionHealth +
      "). Please reconnect QuickBooks before posting.";
    const tags = await listTagsForReport(report.id);
    const tagNames = tags.map((t) => t.name);
    const preview = await buildGlPreview(report);
    const payload = buildJournalEntryPayload(preview, tagNames);
    await db.insert(qboPostingEventsTable).values({
      orgId: report.orgId,
      reportId: report.id,
      journalId: `QBO-J-${NANOID()}`,
      payload,
      status: "error",
      errorMessage,
      tagsSent: tagNames,
      environment: conn.environment,
      realmId: conn.realmId,
    });
    await db
      .update(qboConnectionTable)
      .set({ lastFailedPostAt: new Date(), lastSyncError: errorMessage })
      .where(eq(qboConnectionTable.orgId, report.orgId));
    return { status: "error", errorMessage, payload };
  }

  return postReportToQboStub(report, conn, options);
}

async function postReportToQboStub(
  report: ExpenseReport,
  _conn: QboConnection,
  options: PostOptions,
): Promise<PostResult> {
  const preview = await buildGlPreview(report);
  const tags = await listTagsForReport(report.id);
  const tagNames = tags.map((t) => t.name);
  const journalId = `QBO-J-${NANOID()}`;
  const payload = buildJournalEntryPayload(preview, tagNames);

  const errorRate = parseStubErrorRate(process.env["QBO_STUB_SYNC_ERROR_RATE"]);
  const failThreshold = Math.round(errorRate * 50);
  const shouldFail =
    !options.forceSuccess &&
    failThreshold > 0 &&
    hashFailureBucket(report.id) < failThreshold;
  if (shouldFail) {
    const errorMessage =
      "QuickBooks: Account 'Employee Reimbursement Payable' is inactive (stub)";
    await db.insert(qboPostingEventsTable).values({
      orgId: report.orgId,
      reportId: report.id,
      journalId,
      payload,
      status: "error",
      errorMessage,
      tagsSent: tagNames,
      environment: _conn.environment,
      realmId: _conn.realmId,
    });
    await db
      .update(qboConnectionTable)
      .set({ lastFailedPostAt: new Date(), lastSyncError: errorMessage })
      .where(eq(qboConnectionTable.orgId, report.orgId));
    return { status: "error", errorMessage, payload };
  }

  const successStatus: "posted" | "retried" = options.retry ? "retried" : "posted";
  await db.insert(qboPostingEventsTable).values({
    orgId: report.orgId,
    reportId: report.id,
    journalId,
    payload,
    status: successStatus,
    tagsSent: tagNames,
    environment: _conn.environment,
    realmId: _conn.realmId,
  });
  await db
    .update(qboConnectionTable)
    .set({ lastSuccessfulPostAt: new Date(), lastSyncAt: new Date() })
    .where(eq(qboConnectionTable.orgId, report.orgId));
  return {
    status: successStatus,
    journalId,
    qboJournalId: null,
    qboSyncToken: null,
    attachableIds: [],
    tagsSent: tagNames,
    payload,
  };
}

async function postReportToQboReal(
  report: ExpenseReport,
  conn: QboConnection,
  options: PostOptions,
): Promise<PostResult> {
  // Auto-resolve a default payable account if the org hasn't picked one
  // in admin yet. Without this, buildGlPreview falls back to a hardcoded
  // "Employee Reimbursement Payable" name with no QBO Account Id, the
  // credit AccountRef ships without a `value`, and Intuit rejects the
  // JournalEntry with the generic "Required param missing, need to
  // supply the required value for the API" Fault — exactly the recurring
  // failure on reports posted right after a fresh QBO connect. Pick the
  // first active "Accounts Payable" account from the cached chart of
  // accounts (refreshing the cache from QBO if it doesn't have one yet),
  // persist it on the connection, and continue with the resolved value.
  if (!conn.defaultPayableAccountId) {
    const resolved = await autoResolveAndPersistDefaultPayableAccount({
      orgId: report.orgId,
      ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    });
    if (resolved) {
      conn = {
        ...conn,
        defaultPayableAccountId: resolved.qboAccountId,
        defaultPayableAccountName: resolved.name,
      };
    }
  }
  const preview = await buildGlPreview(report);
  const tags = await listTagsForReport(report.id);
  const tagNames = tags.map((t) => t.name);
  // Pre-flight: every line must have a QBO Account Id. Intuit's
  // JournalEntry API requires AccountRef.value (the durable Account Id)
  // — sending only the human name returns the generic
  // "Request has invalid or unsupported property" Fault and the post
  // is rejected. We previously fell through to the wire with name-only
  // refs, which surfaced as the same opaque Intuit error to finance
  // users with no actionable hint. Detect this case here and persist
  // a clear, actionable error instead of calling Intuit.
  const missingAccount = describeMissingAccountIds(preview);
  if (missingAccount) {
    const errorMessage =
      `Cannot post to QuickBooks: ${missingAccount}. ` +
      `Open QuickBooks settings and either set a default payable account ` +
      `or link the affected category to a Chart-of-Accounts entry, then retry. ` +
      `(No request was sent to QuickBooks — this is a local validation failure.)`;
    const payload = buildJournalEntryPayload(preview, tagNames);
    await persistPostingFailure(report, conn, payload, tagNames, errorMessage);
    return { status: "error", errorMessage, payload };
  }
  // Refresh tokens if near-expired before posting.
  const fresh = await refreshOrgTokensIfNeeded({
    orgId: report.orgId,
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
  });
  const liveConn = fresh.accessTokenEncrypted ? fresh : conn;
  if (
    !liveConn.accessTokenEncrypted ||
    !liveConn.refreshTokenEncrypted ||
    !liveConn.clientIdEncrypted ||
    !liveConn.clientSecretEncrypted ||
    !liveConn.realmId
  ) {
    const errorMessage = "QuickBooks connection is incomplete; reconnect required.";
    const payload = buildJournalEntryPayload(preview, tagNames);
    await persistPostingFailure(report, liveConn, payload, tagNames, errorMessage);
    return { status: "error", errorMessage, payload };
  }
  const client = createIntuitAccountingClient({
    environment: liveConn.environment,
    clientId: decryptString(liveConn.clientIdEncrypted),
    clientSecret: decryptString(liveConn.clientSecretEncrypted),
    realmId: liveConn.realmId,
    accessToken: decryptString(liveConn.accessTokenEncrypted),
    refreshToken: decryptString(liveConn.refreshTokenEncrypted),
    ...(options.fetchFn ? { fetchFn: options.fetchFn } : {}),
    onTokenRefresh: async (tokens) => {
      // Persist refreshed tokens so the next request picks them up.
      const now = new Date();
      const tokenExpiresAt = new Date(now.getTime() + tokens.expires_in * 1000);
      const refreshExpiresAt = new Date(
        now.getTime() + tokens.x_refresh_token_expires_in * 1000,
      );
      await db
        .update(qboConnectionTable)
        .set({
          accessTokenEncrypted: encryptString(tokens.access_token),
          refreshTokenEncrypted: encryptString(tokens.refresh_token),
          tokenExpiresAt,
          refreshTokenExpiresAt: refreshExpiresAt,
          lastTokenRefreshAt: now,
        })
        .where(eq(qboConnectionTable.orgId, report.orgId));
    },
  });

  // Resolve a Vendor reference for any AP/AR line that needs one. Intuit
  // requires JournalEntryLineDetail.Entity on every line whose AccountRef
  // targets an Accounts Payable or Accounts Receivable account; sending
  // the JE without it returns the generic "Required param missing, need
  // to supply the required value for the API" Fault and parks the report
  // in Sync Error. We source the entity from the report submitter
  // (lookup or create their Vendor in QBO, cached per (org,user) so we
  // only pay the round-trip on the first post for a given submitter).
  // If any line has an accountId but no cached accountType (cold or stale
  // qbo_accounts_cache for that account), look it up live from QBO before
  // evaluating Entity attachment — otherwise an AP/AR line could ship
  // without its required Entity block and we'd reproduce the original
  // "Required param missing" Fault from report 2222ff05.
  const accountTypeResult = await ensureAccountTypesForLines({
    orgId: report.orgId,
    client,
    lines: [...preview.debits, ...preview.credits],
  });
  // If any line still has no resolved AccountType after the cache-then-
  // live-lookup pass, AP/AR detection is not authoritative — posting
  // anyway risks shipping an Accounts Payable / Accounts Receivable line
  // without its required Entity block, which Intuit rejects with the
  // generic "Required param missing, need to supply the required value
  // for the API" Fault. Fail fast with an actionable local error so the
  // org can refresh their chart of accounts (or fix QBO connectivity)
  // instead of seeing the opaque Intuit message and a stuck report.
  if (accountTypeResult.unresolvedAccountIds.length > 0) {
    const idsList = accountTypeResult.unresolvedAccountIds.join(", ");
    const why = accountTypeResult.liveLookupError
      ? ` Live lookup failed: ${accountTypeResult.liveLookupError.message}.`
      : "";
    const errorMessage =
      `Cannot post to QuickBooks: could not determine the QuickBooks AccountType ` +
      `for one or more accounts on this report (Account Id(s): ${idsList}). ` +
      `Without an authoritative AccountType, Accounts Payable / Accounts Receivable ` +
      `lines would be sent without their required Entity reference and QuickBooks ` +
      `would reject the entire entry with "Required param missing".${why} ` +
      `Refresh the QuickBooks chart of accounts in admin and try again. ` +
      `(Blocked by local validation — no JournalEntry was sent to QuickBooks.)`;
    const payload = buildJournalEntryPayload(preview, tagNames);
    await persistPostingFailure(
      report,
      liveConn,
      payload,
      tagNames,
      errorMessage,
    );
    return { status: "error", errorMessage, payload };
  }

  const entityRequired =
    preview.debits.some(lineRequiresEntity) ||
    preview.credits.some(lineRequiresEntity);
  if (entityRequired) {
    try {
      const vendor = await resolveSubmitterVendor({
        orgId: report.orgId,
        userId: report.employeeId,
        client,
      });
      const attach = (line: GlPreviewLine): GlPreviewLine =>
        lineRequiresEntity(line)
          ? {
              ...line,
              entity: {
                type: "Vendor",
                refValue: vendor.qboVendorId,
                refName: vendor.displayName,
              },
            }
          : line;
      preview.debits = preview.debits.map(attach);
      preview.credits = preview.credits.map(attach);
    } catch (err) {
      const errorMessage =
        `Cannot post to QuickBooks: failed to resolve a QuickBooks Vendor for the report submitter, ` +
        `which is required when posting to an Accounts Payable account. ` +
        `${err instanceof Error ? err.message : String(err)}`;
      const payload = buildJournalEntryPayload(preview, tagNames);
      await persistPostingFailure(
        report,
        liveConn,
        payload,
        tagNames,
        errorMessage,
      );
      return { status: "error", errorMessage, payload };
    }
  }

  const payload = buildJournalEntryPayload(preview, tagNames);

  // Idempotency key: report id + attempt count (existing posting events).
  const priorAttempts = await db
    .select({ id: qboPostingEventsTable.id })
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  const idempotencyKey = `${report.id}-${priorAttempts.length}`;

  let postResult;
  try {
    postResult = await client.postJournalEntry(payload, idempotencyKey);
  } catch (err) {
    const errorMessage = describeIntuitError(err);
    await persistPostingFailure(report, liveConn, payload, tagNames, errorMessage);
    return { status: "error", errorMessage, payload };
  }

  // Upload receipts as Attachables linked to the journal entry. We tolerate
  // partial failures here — the journal entry is the primary action, and an
  // attachable failure should not roll the journal back. We log warnings.
  const attachableIds = await uploadReceiptsAsAttachables({
    reportId: report.id,
    journalEntryId: postResult.Id,
    client,
  });

  const journalId = `QBO-J-${NANOID()}`;
  const successStatus: "posted" | "retried" = options.retry ? "retried" : "posted";
  await db.insert(qboPostingEventsTable).values({
    orgId: report.orgId,
    reportId: report.id,
    journalId,
    qboJournalId: postResult.Id,
    qboSyncToken: postResult.SyncToken,
    payload,
    status: successStatus,
    tagsSent: tagNames,
    attachableIds,
    environment: liveConn.environment,
    realmId: liveConn.realmId,
  });
  await db
    .update(qboConnectionTable)
    .set({
      lastSuccessfulPostAt: new Date(),
      lastSyncAt: new Date(),
      lastSyncError: null,
    })
    .where(eq(qboConnectionTable.orgId, report.orgId));

  return {
    status: successStatus,
    journalId,
    qboJournalId: postResult.Id,
    qboSyncToken: postResult.SyncToken,
    attachableIds,
    tagsSent: tagNames,
    payload,
  };
}

async function persistPostingFailure(
  report: ExpenseReport,
  conn: QboConnection,
  payload: Record<string, unknown>,
  tagNames: string[],
  errorMessage: string,
): Promise<void> {
  const journalId = `QBO-J-${NANOID()}`;
  await db.insert(qboPostingEventsTable).values({
    orgId: report.orgId,
    reportId: report.id,
    journalId,
    payload,
    status: "error",
    errorMessage,
    tagsSent: tagNames,
    environment: conn.environment,
    realmId: conn.realmId,
  });
  await db
    .update(qboConnectionTable)
    .set({ lastFailedPostAt: new Date(), lastSyncError: errorMessage })
    .where(eq(qboConnectionTable.orgId, report.orgId));
}

async function uploadReceiptsAsAttachables(args: {
  reportId: string;
  journalEntryId: string;
  client: ReturnType<typeof createIntuitAccountingClient>;
}): Promise<string[]> {
  const receipts = await db
    .select()
    .from(receiptsTable)
    .where(eq(receiptsTable.reportId, args.reportId));
  if (receipts.length === 0) return [];

  const storage = new ObjectStorageService();
  const ids: string[] = [];
  for (const receipt of receipts) {
    try {
      const file = await storage.getObjectEntityFile(receipt.objectPath);
      const [buffer] = await file.download();
      const result = await args.client.uploadAttachable({
        journalEntryId: args.journalEntryId,
        fileName: receipt.filename,
        contentType: receipt.mimeType,
        fileBytes: buffer,
        note: `Receipt for report ${args.reportId}`,
      });
      ids.push(result.Id);
    } catch (err) {
      logger.warn(
        { err, receiptId: receipt.id, journalId: args.journalEntryId },
        "Failed to upload receipt as Attachable",
      );
    }
  }
  return ids;
}

/**
 * Build an Intuit JournalEntry payload from the GL preview.
 *
 * AccountRef prefers the durable QBO account `value` (Id) when the GL
 * mapping has been linked to a real Chart-of-Accounts entry. Intuit matches
 * by Id and the human-readable name can drift in QBO without our knowledge.
 * In stub mode (no real QBO connection, accountId is null) we fall back to
 * AccountRef-by-name, which the stub posting path tolerates.
 */
/**
 * Returns a human-readable description of the first preview line missing
 * a QBO Account Id, or null if every line has one. Used as a pre-flight
 * before posting to a real Intuit connection — see postReportToQboReal.
 */
export function describeMissingAccountIds(preview: GlPreview): string | null {
  for (const d of preview.debits) {
    if (!d.accountId) {
      return `debit account "${d.account}" (category "${d.category}") has no QuickBooks Account Id`;
    }
  }
  for (const c of preview.credits) {
    if (!c.accountId) {
      return `credit account "${c.account}" has no QuickBooks Account Id`;
    }
  }
  return null;
}

function buildAccountRef(line: GlPreviewLine): Record<string, string> {
  if (line.accountId) {
    return { value: line.accountId, name: line.account };
  }
  return { name: line.account };
}

function buildLineDetail(line: GlPreviewLine, postingType: "Debit" | "Credit"): Record<string, unknown> {
  const detail: Record<string, unknown> = {
    PostingType: postingType,
    AccountRef: buildAccountRef(line),
  };
  if (line.entity) {
    // Intuit JournalEntryLineDetail.Entity shape:
    //   { Type: "Vendor", EntityRef: { value, name } }
    // Required on every line whose AccountRef targets an A/P or A/R
    // account; sending a JournalEntry without it is what produces the
    // generic "Required param missing, need to supply the required
    // value for the API" Fault Intuit returns for these lines.
    detail.Entity = {
      Type: line.entity.type,
      EntityRef: { value: line.entity.refValue, name: line.entity.refName },
    };
  }
  return detail;
}

export function buildJournalEntryPayload(
  preview: GlPreview,
  tagNames: string[],
): Record<string, unknown> {
  // Intuit's JournalEntry schema does not define a `Tag` property at the
  // entry header — sending one causes validation error 6000 ("invalid or
  // unsupported property") and the whole post is rejected. To keep tag
  // context visible inside QuickBooks without sending an unsupported field,
  // we append the tag names to the PrivateNote. The internal
  // `qbo_posting_events.tagsSent` column still records the tags we
  // associated with the post for our own audit/reporting purposes.
  const privateNote =
    tagNames.length > 0
      ? `${preview.memo} — Tags: ${tagNames.join(", ")}`
      : preview.memo;
  return {
    JournalEntry: {
      DocNumber: preview.displayCode,
      TxnDate: preview.journalDate,
      PrivateNote: privateNote,
      Line: [
        ...preview.debits.map((d, idx) => ({
          Id: String(idx + 1),
          Description: d.category,
          Amount: parseFloat(d.amount),
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: buildLineDetail(d, "Debit"),
        })),
        ...preview.credits.map((c, idx) => ({
          Id: String(preview.debits.length + idx + 1),
          Description: c.category,
          Amount: parseFloat(c.amount),
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: buildLineDetail(c, "Credit"),
        })),
      ],
      CurrencyRef: { value: preview.currency },
      TotalAmt: parseFloat(preview.totalDebits),
    },
  };
}

function hashFailureBucket(s: string): number {
  let h = 0;
  for (const ch of s) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return h % 50;
}

function parseStubErrorRate(raw: string | undefined): number {
  if (!raw) return 0;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(v, 1);
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

export async function listTags(orgId: string) {
  return db
    .select()
    .from(qboTagsTable)
    .where(eq(qboTagsTable.orgId, orgId));
}

export async function createTag(args: {
  orgId: string;
  name: string;
  color?: string | null;
}) {
  const [row] = await db
    .insert(qboTagsTable)
    .values({
      orgId: args.orgId,
      name: args.name,
      color: args.color ?? null,
    })
    .returning();
  return row;
}

export async function updateTag(args: {
  orgId: string;
  id: string;
  name?: string;
  color?: string | null;
  active?: boolean;
}) {
  const updates: Partial<typeof qboTagsTable.$inferInsert> = {};
  if (args.name !== undefined) updates.name = args.name;
  if (args.color !== undefined) updates.color = args.color;
  if (args.active !== undefined) updates.active = args.active;
  const [row] = await db
    .update(qboTagsTable)
    .set(updates)
    .where(and(eq(qboTagsTable.id, args.id), eq(qboTagsTable.orgId, args.orgId)))
    .returning();
  return row ?? null;
}

export async function deleteTag(args: { orgId: string; id: string }) {
  const [row] = await db
    .delete(qboTagsTable)
    .where(and(eq(qboTagsTable.id, args.id), eq(qboTagsTable.orgId, args.orgId)))
    .returning();
  return row ?? null;
}

export async function listTagsForReport(reportId: string) {
  return db
    .select({
      id: qboTagsTable.id,
      name: qboTagsTable.name,
      color: qboTagsTable.color,
      active: qboTagsTable.active,
    })
    .from(qboTagAssignmentsTable)
    .innerJoin(qboTagsTable, eq(qboTagAssignmentsTable.tagId, qboTagsTable.id))
    .where(eq(qboTagAssignmentsTable.reportId, reportId));
}

export async function setReportTags(args: {
  orgId: string;
  reportId: string;
  tagIds: string[];
}) {
  // Validate all tags exist in the org.
  if (args.tagIds.length > 0) {
    const found = await db
      .select({ id: qboTagsTable.id })
      .from(qboTagsTable)
      .where(
        and(
          eq(qboTagsTable.orgId, args.orgId),
          inArray(qboTagsTable.id, args.tagIds),
        ),
      );
    if (found.length !== args.tagIds.length) {
      throw new Error("One or more tag ids are not in this org.");
    }
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(qboTagAssignmentsTable)
      .where(eq(qboTagAssignmentsTable.reportId, args.reportId));
    if (args.tagIds.length > 0) {
      await tx.insert(qboTagAssignmentsTable).values(
        args.tagIds.map((tagId) => ({
          orgId: args.orgId,
          reportId: args.reportId,
          tagId,
        })),
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Chart of Accounts (real-only; stub-mode returns empty list).
// ---------------------------------------------------------------------------

export type CachedAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  accountType: string;
  accountSubType: string | null;
  classification: string | null;
  active: boolean;
};

export async function listChartOfAccounts(args: {
  orgId: string;
  forceRefresh?: boolean;
  fetchFn?: typeof fetch;
}): Promise<CachedAccount[]> {
  const conn = await ensureConnectionRow(args.orgId);
  if (!isRealConnected(conn)) return [];
  const cached = await db
    .select()
    .from(qboAccountsCacheTable)
    .where(eq(qboAccountsCacheTable.orgId, args.orgId));
  const fresh = cached.length > 0
    ? Date.now() - cached[0].fetchedAt.getTime() < ACCOUNTS_CACHE_TTL_MS
    : false;
  if (fresh && !args.forceRefresh) {
    return cached.map(toCachedAccountDto);
  }
  // Fetch fresh from QBO.
  const liveConn = await refreshOrgTokensIfNeeded({
    orgId: args.orgId,
    ...(args.fetchFn ? { fetchFn: args.fetchFn } : {}),
  });
  if (
    !liveConn.accessTokenEncrypted ||
    !liveConn.clientIdEncrypted ||
    !liveConn.clientSecretEncrypted ||
    !liveConn.realmId
  ) {
    return [];
  }
  const client = createIntuitAccountingClient({
    environment: liveConn.environment,
    clientId: decryptString(liveConn.clientIdEncrypted),
    clientSecret: decryptString(liveConn.clientSecretEncrypted),
    realmId: liveConn.realmId,
    accessToken: decryptString(liveConn.accessTokenEncrypted),
    refreshToken: liveConn.refreshTokenEncrypted
      ? decryptString(liveConn.refreshTokenEncrypted)
      : null,
    ...(args.fetchFn ? { fetchFn: args.fetchFn } : {}),
  });
  let accounts: CachedAccount[];
  try {
    const result = await client.query<{
      QueryResponse?: {
        Account?: Array<{
          Id: string;
          Name: string;
          FullyQualifiedName: string;
          AccountType: string;
          AccountSubType?: string;
          Classification?: string;
          Active: boolean;
          SyncToken?: string;
        }>;
      };
    }>("SELECT * FROM Account MAXRESULTS 1000");
    accounts = (result.QueryResponse?.Account ?? []).map((a) => ({
      id: a.Id,
      name: a.Name,
      fullyQualifiedName: a.FullyQualifiedName,
      accountType: a.AccountType,
      accountSubType: a.AccountSubType ?? null,
      classification: a.Classification ?? null,
      active: a.Active,
    }));
  } catch (err) {
    logger.warn(
      { err, orgId: args.orgId },
      "Failed to fetch QBO chart of accounts",
    );
    return cached.map(toCachedAccountDto);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(qboAccountsCacheTable)
      .where(eq(qboAccountsCacheTable.orgId, args.orgId));
    if (accounts.length > 0) {
      await tx.insert(qboAccountsCacheTable).values(
        accounts.map((a) => ({
          orgId: args.orgId,
          qboAccountId: a.id,
          name: a.name,
          fullyQualifiedName: a.fullyQualifiedName,
          accountType: a.accountType,
          accountSubType: a.accountSubType,
          classification: a.classification,
          active: a.active,
        })),
      );
    }
  });
  return accounts;
}

/**
 * Resolve a QBO Vendor for a workforce user (the report submitter), looking
 * the cached id up first and falling back to a name lookup + create round-
 * trip on the live Intuit API. The cache short-circuits subsequent posts
 * for the same submitter so we don't repeatedly query/insert.
 *
 * Failure modes are bubbled up to the caller — we'd rather park the post
 * with an actionable "could not resolve vendor" message than silently
 * post without an Entity reference and let Intuit reject the JE with the
 * generic "Required param missing" Fault.
 */
export async function resolveSubmitterVendor(args: {
  orgId: string;
  userId: string;
  client: IntuitAccountingClient;
}): Promise<{ qboVendorId: string; displayName: string }> {
  const cached = (
    await db
      .select()
      .from(qboVendorCacheTable)
      .where(
        and(
          eq(qboVendorCacheTable.orgId, args.orgId),
          eq(qboVendorCacheTable.userId, args.userId),
        ),
      )
      .limit(1)
  )[0];
  if (cached) {
    return {
      qboVendorId: cached.qboVendorId,
      displayName: cached.displayName,
    };
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
    })
    .from(usersTable)
    .where(eq(usersTable.id, args.userId))
    .limit(1);
  if (!user) {
    throw new Error(`Submitter user ${args.userId} not found`);
  }
  const displayName = (user.fullName?.trim() || user.email).slice(0, 100);

  // Look the vendor up first so we don't trigger a "Duplicate Name Exists"
  // create. Intuit's query language requires single-quote escaping.
  const escaped = displayName.replace(/'/g, "''");
  type VendorRow = { Id: string; DisplayName: string };
  let resolvedId: string | null = null;
  let resolvedName: string = displayName;
  try {
    const queryResult = await args.client.query<{
      QueryResponse?: { Vendor?: VendorRow[] };
    }>(`SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${escaped}'`);
    const row = queryResult.QueryResponse?.Vendor?.[0];
    if (row) {
      resolvedId = row.Id;
      resolvedName = row.DisplayName;
    }
  } catch (err) {
    logger.warn(
      { err, orgId: args.orgId, userId: args.userId, displayName },
      "QBO vendor lookup failed; will attempt create",
    );
  }

  if (!resolvedId) {
    try {
      const created = await args.client.createVendor({
        displayName,
        primaryEmail: user.email,
      });
      resolvedId = created.Id;
      resolvedName = displayName;
    } catch (err) {
      // Duplicate-name conflicts can occur if a Customer (or another
      // entity) already uses this name and our prior query missed it
      // (Vendor query is scoped to Vendor). Re-query before giving up
      // so the next attempt at least sees what's actually there.
      if (
        err instanceof IntuitApiError &&
        /duplicate/i.test(err.message)
      ) {
        try {
          const reQuery = await args.client.query<{
            QueryResponse?: { Vendor?: VendorRow[] };
          }>(`SELECT Id, DisplayName FROM Vendor WHERE DisplayName = '${escaped}'`);
          const row = reQuery.QueryResponse?.Vendor?.[0];
          if (row) {
            resolvedId = row.Id;
            resolvedName = row.DisplayName;
          }
        } catch {
          /* fall through to throw */
        }
      }
      if (!resolvedId) throw err;
    }
  }

  // Cache the resolution. ON CONFLICT keeps the existing row in case a
  // concurrent post raced us — both rows resolve the same Vendor Id, so
  // either is acceptable.
  await db
    .insert(qboVendorCacheTable)
    .values({
      orgId: args.orgId,
      userId: args.userId,
      qboVendorId: resolvedId,
      displayName: resolvedName,
    })
    .onConflictDoUpdate({
      target: [qboVendorCacheTable.orgId, qboVendorCacheTable.userId],
      set: { qboVendorId: resolvedId, displayName: resolvedName, fetchedAt: new Date() },
    });

  return { qboVendorId: resolvedId, displayName: resolvedName };
}

/**
 * Pick a default payable account from a list of cached chart-of-accounts
 * rows. Returns the first active row whose accountType is exactly
 * "Accounts Payable" (Intuit's canonical AccountType for an A/P account),
 * or null if none exists yet. Sorted by qboAccountId so the choice is
 * deterministic across calls and inserts.
 *
 * Used by both `buildGlPreview` (read-side fallback so the GL preview UI
 * shows a real account name) and `autoResolveAndPersistDefaultPayableAccount`
 * (write-side persistence before posting).
 */
function pickDefaultPayableFromCachedAccounts<
  T extends { qboAccountId: string; name: string; accountType: string; active: boolean },
>(rows: readonly T[]): T | null {
  const candidates = rows
    .filter((r) => r.active && ENTITY_REQUIRED_ACCOUNT_TYPES.has(r.accountType))
    .filter((r) => r.accountType === "Accounts Payable")
    .sort((a, b) => a.qboAccountId.localeCompare(b.qboAccountId));
  return candidates[0] ?? null;
}

/**
 * Resolve and persist a default payable account on the org's qbo_connection
 * row when one isn't set yet. Tries the cached chart of accounts first; if
 * the cache has no Accounts Payable row, force-refreshes the chart from
 * QBO and tries again. Returns the resolved account, or null if QBO has no
 * Accounts Payable account at all (in which case the caller will surface
 * the existing actionable "missing Account Id" error from the pre-flight).
 *
 * This is the durable fix for the "Required param missing" Fault Intuit
 * returns on JE posts whose credit AccountRef has no `value` — without a
 * defaultPayableAccountId, the credit line shipped a name-only AccountRef
 * and Intuit rejected the entire entry.
 */
async function autoResolveAndPersistDefaultPayableAccount(args: {
  orgId: string;
  fetchFn?: typeof fetch;
}): Promise<{ qboAccountId: string; name: string } | null> {
  const cached = await db
    .select({
      qboAccountId: qboAccountsCacheTable.qboAccountId,
      name: qboAccountsCacheTable.name,
      accountType: qboAccountsCacheTable.accountType,
      active: qboAccountsCacheTable.active,
    })
    .from(qboAccountsCacheTable)
    .where(eq(qboAccountsCacheTable.orgId, args.orgId));
  let pick = pickDefaultPayableFromCachedAccounts(cached);
  if (!pick) {
    // Cache has no AP row yet; refresh from QBO and try again. Best-effort:
    // if the live fetch fails the caller will fall through to the existing
    // "no QuickBooks Account Id" pre-flight error.
    try {
      const fresh = await listChartOfAccounts({
        orgId: args.orgId,
        forceRefresh: true,
        ...(args.fetchFn ? { fetchFn: args.fetchFn } : {}),
      });
      pick = pickDefaultPayableFromCachedAccounts(
        fresh.map((a) => ({
          qboAccountId: a.id,
          name: a.name,
          accountType: a.accountType,
          active: a.active,
        })),
      );
    } catch (err) {
      logger.warn(
        { err, orgId: args.orgId },
        "Failed to refresh QBO chart of accounts while auto-resolving default payable account",
      );
    }
  }
  if (!pick) return null;
  await db
    .update(qboConnectionTable)
    .set({
      defaultPayableAccountId: pick.qboAccountId,
      defaultPayableAccountName: pick.name,
    })
    .where(eq(qboConnectionTable.orgId, args.orgId));
  logger.info(
    { orgId: args.orgId, qboAccountId: pick.qboAccountId, name: pick.name },
    "Auto-selected default payable account from QBO chart of accounts",
  );
  return { qboAccountId: pick.qboAccountId, name: pick.name };
}

/**
 * Mutates `lines` in place: for any line whose `accountId` is set but whose
 * `accountType` is null (cache miss/stale), live-query Intuit for the
 * AccountType and patch both the line and `qbo_accounts_cache`. Used by
 * the real-mode posting path so that AP/AR detection is deterministic
 * regardless of cache warmth — without this, a cold cache would silently
 * drop the required Entity block on AP/AR lines and reproduce the
 * "Required param missing" Fault.
 */
export async function ensureAccountTypesForLines(args: {
  orgId: string;
  client: IntuitAccountingClient;
  lines: GlPreviewLine[];
}): Promise<{
  unresolvedAccountIds: string[];
  liveLookupError: Error | null;
}> {
  const missingIds = Array.from(
    new Set(
      args.lines
        .filter((l) => l.accountId && !l.accountType)
        .map((l) => l.accountId as string),
    ),
  );
  if (missingIds.length === 0) {
    return { unresolvedAccountIds: [], liveLookupError: null };
  }

  // Try the cache once more in case a concurrent path warmed it.
  const cached = await db
    .select({
      qboAccountId: qboAccountsCacheTable.qboAccountId,
      accountType: qboAccountsCacheTable.accountType,
    })
    .from(qboAccountsCacheTable)
    .where(eq(qboAccountsCacheTable.orgId, args.orgId));
  const known = new Map(cached.map((c) => [c.qboAccountId, c.accountType] as const));
  const stillMissing = missingIds.filter((id) => !known.has(id));

  // Resolve any remaining ids by querying Intuit directly. Intuit's IN
  // operator on Id requires single-quoted string literals.
  const fetched = new Map<
    string,
    {
      name: string;
      fullyQualifiedName: string;
      accountType: string;
      accountSubType: string | null;
      classification: string | null;
      active: boolean;
    }
  >();
  let liveLookupError: Error | null = null;
  if (stillMissing.length > 0) {
    const inList = stillMissing.map((id) => `'${id.replace(/'/g, "''")}'`).join(",");
    try {
      const res = await args.client.query<{
        QueryResponse?: {
          Account?: Array<{
            Id: string;
            Name: string;
            FullyQualifiedName: string;
            AccountType: string;
            AccountSubType?: string;
            Classification?: string;
            Active: boolean;
          }>;
        };
      }>(`SELECT * FROM Account WHERE Id IN (${inList})`);
      for (const a of res.QueryResponse?.Account ?? []) {
        fetched.set(a.Id, {
          name: a.Name,
          fullyQualifiedName: a.FullyQualifiedName,
          accountType: a.AccountType,
          accountSubType: a.AccountSubType ?? null,
          classification: a.Classification ?? null,
          active: a.Active,
        });
        known.set(a.Id, a.AccountType);
      }
    } catch (err) {
      liveLookupError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        { err, orgId: args.orgId, accountIds: stillMissing },
        "Failed to resolve QBO account types for posting; caller must abort to avoid shipping AP/AR lines without Entity",
      );
    }
    if (fetched.size > 0) {
      await db
        .insert(qboAccountsCacheTable)
        .values(
          [...fetched.entries()].map(([id, a]) => ({
            orgId: args.orgId,
            qboAccountId: id,
            name: a.name,
            fullyQualifiedName: a.fullyQualifiedName,
            accountType: a.accountType,
            accountSubType: a.accountSubType,
            classification: a.classification,
            active: a.active,
          })),
        )
        .onConflictDoUpdate({
          target: [qboAccountsCacheTable.orgId, qboAccountsCacheTable.qboAccountId],
          set: {
            accountType: sql`excluded.account_type`,
            accountSubType: sql`excluded.account_sub_type`,
            classification: sql`excluded.classification`,
            name: sql`excluded.name`,
            fullyQualifiedName: sql`excluded.fully_qualified_name`,
            active: sql`excluded.active`,
            fetchedAt: new Date(),
          },
        });
    }
  }

  for (const line of args.lines) {
    if (line.accountId && !line.accountType) {
      const t = known.get(line.accountId);
      if (t) line.accountType = t;
    }
  }
  const unresolvedAccountIds = Array.from(
    new Set(
      args.lines
        .filter((l) => l.accountId && !l.accountType)
        .map((l) => l.accountId as string),
    ),
  );
  return { unresolvedAccountIds, liveLookupError };
}

function toCachedAccountDto(
  row: typeof qboAccountsCacheTable.$inferSelect,
): CachedAccount {
  return {
    id: row.qboAccountId,
    name: row.name,
    fullyQualifiedName: row.fullyQualifiedName,
    accountType: row.accountType,
    accountSubType: row.accountSubType,
    classification: row.classification,
    active: row.active,
  };
}

// ---------------------------------------------------------------------------
// Health and posting history
// ---------------------------------------------------------------------------

export type TokenRefreshLogDto = {
  id: string;
  success: boolean;
  errorMessage: string | null;
  expiresInSeconds: number | null;
  createdAt: string;
};

export type ConnectionHealthDto = {
  mode: QboConnection["mode"];
  status: QboConnection["status"];
  health: QboConnection["connectionHealth"];
  environment: QboConnection["environment"];
  realmId: string | null;
  companyName: string | null;
  hasCredentials: boolean;
  lastTokenRefreshAt: string | null;
  lastTokenRefreshError: string | null;
  tokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  lastSuccessfulPostAt: string | null;
  lastFailedPostAt: string | null;
  recentRefreshAttempts: TokenRefreshLogDto[];
};

export async function getConnectionHealth(orgId: string): Promise<ConnectionHealthDto> {
  const conn = await ensureConnectionRow(orgId);
  const recent = await db
    .select()
    .from(qboTokenRefreshLogTable)
    .where(eq(qboTokenRefreshLogTable.orgId, orgId))
    .orderBy(desc(qboTokenRefreshLogTable.createdAt))
    .limit(10);
  return {
    mode: conn.mode,
    status: conn.status,
    health: conn.connectionHealth,
    environment: conn.environment,
    realmId: conn.realmId,
    companyName: conn.companyName,
    hasCredentials: hasRealCredentials(conn),
    lastTokenRefreshAt: conn.lastTokenRefreshAt?.toISOString() ?? null,
    lastTokenRefreshError: conn.lastTokenRefreshError,
    tokenExpiresAt: conn.tokenExpiresAt?.toISOString() ?? null,
    refreshTokenExpiresAt: conn.refreshTokenExpiresAt?.toISOString() ?? null,
    lastSuccessfulPostAt: conn.lastSuccessfulPostAt?.toISOString() ?? null,
    lastFailedPostAt: conn.lastFailedPostAt?.toISOString() ?? null,
    recentRefreshAttempts: recent.map((r) => ({
      id: r.id,
      success: r.success,
      errorMessage: r.errorMessage,
      expiresInSeconds: r.expiresInSeconds,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export type PostingHistoryItemDto = {
  id: string;
  reportId: string;
  reportDisplayCode: string;
  status: "posted" | "retried" | "error";
  journalId: string;
  qboJournalId: string | null;
  /** Environment of the QBO connection at posting time. */
  environment: QboConnection["environment"];
  realmId: string | null;
  attachableCount: number;
  tagsSent: string[];
  errorMessage: string | null;
  createdAt: string;
};

export async function listPostingHistory(args: {
  orgId: string;
  limit?: number;
}): Promise<PostingHistoryItemDto[]> {
  const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  // We snapshot environment + realmId on each posting event row at write
  // time, so historical entries always link to the original Intuit tenant
  // even if the org later disconnects, switches sandbox <-> prod, or moves
  // to a different company.
  const rows = await db
    .select({
      id: qboPostingEventsTable.id,
      reportId: qboPostingEventsTable.reportId,
      status: qboPostingEventsTable.status,
      journalId: qboPostingEventsTable.journalId,
      qboJournalId: qboPostingEventsTable.qboJournalId,
      environment: qboPostingEventsTable.environment,
      realmId: qboPostingEventsTable.realmId,
      attachableIds: qboPostingEventsTable.attachableIds,
      tagsSent: qboPostingEventsTable.tagsSent,
      errorMessage: qboPostingEventsTable.errorMessage,
      createdAt: qboPostingEventsTable.createdAt,
      reportDisplayCode: expenseReportsTable.displayCode,
    })
    .from(qboPostingEventsTable)
    .innerJoin(
      expenseReportsTable,
      eq(qboPostingEventsTable.reportId, expenseReportsTable.id),
    )
    .where(eq(qboPostingEventsTable.orgId, args.orgId))
    .orderBy(desc(qboPostingEventsTable.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    reportId: r.reportId,
    reportDisplayCode: r.reportDisplayCode,
    status: r.status,
    journalId: r.journalId,
    qboJournalId: r.qboJournalId,
    environment: r.environment,
    realmId: r.realmId,
    attachableCount: Array.isArray(r.attachableIds) ? r.attachableIds.length : 0,
    tagsSent: Array.isArray(r.tagsSent) ? r.tagsSent : [],
    errorMessage: r.errorMessage,
    createdAt: r.createdAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Loose query helpers used by routes.
// ---------------------------------------------------------------------------

export async function loadLastPostingEvent(
  reportId: string,
): Promise<{
  journalId: string | null;
  status: "posted" | "retried" | "error";
} | null> {
  const rows = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, reportId));
  if (rows.length === 0) return null;
  const last = rows.sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  return { journalId: last.qboJournalId ?? last.journalId, status: last.status };
}

export async function pickReportForPosting(
  reportId: string,
  orgId: string,
): Promise<ExpenseReport | null> {
  const rows = await db
    .select()
    .from(expenseReportsTable)
    .where(
      and(
        eq(expenseReportsTable.id, reportId),
        eq(expenseReportsTable.orgId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function markLineItemsForReview(
  reportId: string,
  threshold: number,
): Promise<void> {
  const lines = await db
    .select()
    .from(lineItemsTable)
    .where(eq(lineItemsTable.reportId, reportId));
  for (const line of lines) {
    const amt = parseFloat(line.amount);
    const needs = amt >= threshold;
    if (needs !== line.needsReview) {
      await db
        .update(lineItemsTable)
        .set({ needsReview: needs })
        .where(eq(lineItemsTable.id, line.id));
    }
  }
}

// ---------------------------------------------------------------------------
// Audit helpers (small wrapper that centralises QBO category)
// ---------------------------------------------------------------------------

export async function recordQboAudit(args: {
  orgId: string;
  actor: { id: string; roles: Role[] };
  entityType: "qbo_config" | "qbo_tag" | "qbo_mapping" | "qbo_posting";
  entityId: string;
  action: "created" | "updated" | "deleted";
  fieldDiffs?: Array<{ field: string; before: unknown; after: unknown }>;
}): Promise<void> {
  await recordAudit({
    orgId: args.orgId,
    actor: args.actor,
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    category: "qbo",
    fieldDiffs: args.fieldDiffs ?? [],
  });
}

/**
 * Record a QBO audit entry for a SYSTEM action (no real user — e.g. the
 * background token-refresh sweep). The audit table requires a non-null
 * actorId that FK's to users, so we attribute the action to an Accounting
 * Admin / System Admin in the same org. We pick the most recently active
 * admin so the event surfaces under a real account in the audit log. If no
 * admin exists we silently skip the entry rather than block the sweep.
 */
export async function recordQboSystemAudit(args: {
  orgId: string;
  entityType: "qbo_config" | "qbo_tag" | "qbo_mapping" | "qbo_posting";
  entityId: string;
  action: "created" | "updated" | "deleted";
  fieldDiffs?: Array<{ field: string; before: unknown; after: unknown }>;
}): Promise<void> {
  const admin = (
    await db
      .select({ id: usersTable.id, roles: usersTable.roles })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.orgId, args.orgId),
          // Either role suffices — both can manage QBO config.
          sql`('Accounting Admin' = ANY(${usersTable.roles}) OR 'System Admin' = ANY(${usersTable.roles}))`,
          eq(usersTable.isActive, true),
        ),
      )
      .orderBy(desc(usersTable.createdAt))
      .limit(1)
  )[0];
  if (!admin) return;
  await recordAudit({
    orgId: args.orgId,
    actor: { id: admin.id, roles: admin.roles as Role[] },
    entityType: args.entityType,
    entityId: args.entityId,
    action: args.action,
    category: "qbo",
    fieldDiffs: args.fieldDiffs ?? [],
  });
}
