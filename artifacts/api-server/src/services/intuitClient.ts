/**
 * Thin Intuit Accounting API client.
 *
 * Why hand-rolled? The official `intuit-oauth` SDK pulls in a non-trivial
 * runtime and assumes long-lived in-process tokens. We want per-request
 * tokens (decrypted on the fly), automatic 401-driven refresh, and tight
 * exponential-backoff retries for 429/5xx — all of which are easier with a
 * small purpose-built client than wrestling with the SDK.
 *
 * No external HTTP library is used: Node 18+ ships a global `fetch`, which is
 * sufficient for our needs and avoids adding `axios` as a dependency.
 */

import type { QboEnvironment } from "@workspace/db";

export const INTUIT_DISCOVERY = {
  sandbox: {
    authorizationEndpoint:
      "https://appcenter.intuit.com/connect/oauth2",
    tokenEndpoint:
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    revocationEndpoint:
      "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    apiBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
    appCenterUrl: "https://app.sandbox.qbo.intuit.com/app/",
  },
  production: {
    authorizationEndpoint:
      "https://appcenter.intuit.com/connect/oauth2",
    tokenEndpoint:
      "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    revocationEndpoint:
      "https://developer.api.intuit.com/v2/oauth2/tokens/revoke",
    apiBaseUrl: "https://quickbooks.api.intuit.com",
    appCenterUrl: "https://app.qbo.intuit.com/app/",
  },
} as const;

export type IntuitTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds
  x_refresh_token_expires_in: number;
  token_type: string;
};

export type IntuitClientOptions = {
  environment: QboEnvironment;
  clientId: string;
  clientSecret: string;
  realmId: string;
  accessToken: string;
  refreshToken?: string | null;
  /** Called when an access token is refreshed mid-request. */
  onTokenRefresh?: (tokens: IntuitTokenResponse) => Promise<void> | void;
  /**
   * Test seam: a fetch implementation. Defaults to globalThis.fetch.
   */
  fetchFn?: typeof fetch;
};

export class IntuitApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "IntuitApiError";
  }
}

const MAX_RETRIES = 3;

function basicAuthHeader(clientId: string, clientSecret: string): string {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${creds}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const sec = Number(retryAfterHeader);
    if (Number.isFinite(sec) && sec > 0) return Math.min(sec, 30) * 1000;
  }
  // Exponential backoff with jitter, capped at 8s.
  const base = Math.min(8000, 250 * 2 ** attempt);
  return base + Math.floor(Math.random() * 250);
}

/**
 * Build the Intuit authorization URL. Note: Intuit requires `scope=com.intuit.quickbooks.accounting`
 * and a nonce-style `state` we generate ourselves and persist for callback verification.
 */
export function buildAuthorizationUrl(args: {
  environment: QboEnvironment;
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: args.clientId,
    response_type: "code",
    scope: "com.intuit.quickbooks.accounting",
    redirect_uri: args.redirectUri,
    state: args.state,
  });
  return `${INTUIT_DISCOVERY[args.environment].authorizationEndpoint}?${params.toString()}`;
}

/** Exchanges an authorization `code` for access + refresh tokens. */
export async function exchangeCodeForTokens(args: {
  environment: QboEnvironment;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  fetchFn?: typeof fetch;
}): Promise<IntuitTokenResponse> {
  const fetchImpl = args.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
  });
  const res = await fetchImpl(
    INTUIT_DISCOVERY[args.environment].tokenEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(args.clientId, args.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    throw new IntuitApiError(
      res.status,
      "token_exchange_failed",
      `Intuit token exchange failed (${res.status}): ${text}`,
    );
  }
  return (await res.json()) as IntuitTokenResponse;
}

/** Refresh an access token using a refresh token. */
export async function refreshAccessToken(args: {
  environment: QboEnvironment;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchFn?: typeof fetch;
}): Promise<IntuitTokenResponse> {
  const fetchImpl = args.fetchFn ?? fetch;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: args.refreshToken,
  });
  const res = await fetchImpl(
    INTUIT_DISCOVERY[args.environment].tokenEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(args.clientId, args.clientSecret),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "<no body>");
    // 400 with invalid_grant means the refresh token was revoked or expired.
    let code = "refresh_failed";
    if (res.status === 400 && /invalid_grant/i.test(text)) {
      code = "refresh_token_revoked";
    }
    throw new IntuitApiError(
      res.status,
      code,
      `Intuit token refresh failed (${res.status}): ${text}`,
    );
  }
  return (await res.json()) as IntuitTokenResponse;
}

/** Revoke a refresh or access token. */
export async function revokeToken(args: {
  environment: QboEnvironment;
  clientId: string;
  clientSecret: string;
  token: string;
  fetchFn?: typeof fetch;
}): Promise<void> {
  const fetchImpl = args.fetchFn ?? fetch;
  const res = await fetchImpl(
    INTUIT_DISCOVERY[args.environment].revocationEndpoint,
    {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(args.clientId, args.clientSecret),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: args.token }),
    },
  );
  // Intuit returns 200 on success and 400 if the token is already invalid;
  // both outcomes are acceptable for our "disconnect cleanly" semantics.
  if (!res.ok && res.status !== 400) {
    const text = await res.text().catch(() => "<no body>");
    throw new IntuitApiError(
      res.status,
      "revoke_failed",
      `Intuit token revoke failed (${res.status}): ${text}`,
    );
  }
}

/** Map common Intuit error payloads to a friendly message. */
export function describeIntuitError(error: unknown): string {
  if (error instanceof IntuitApiError) {
    if (error.code === "refresh_token_revoked") {
      return "QuickBooks refresh token was revoked or expired. Reconnect required.";
    }
    if (error.code === "throttled" || error.status === 429) {
      return "QuickBooks rate-limited the request. Please retry shortly.";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

export type IntuitAccountingClient = {
  query<T = unknown>(query: string): Promise<T>;
  postJournalEntry(payload: unknown, idempotencyKey: string): Promise<{
    Id: string;
    SyncToken: string;
    raw: unknown;
  }>;
  uploadAttachable(args: {
    journalEntryId: string;
    fileName: string;
    contentType: string;
    fileBytes: Buffer;
    note?: string;
  }): Promise<{
    Id: string;
    raw: unknown;
  }>;
  fetchCompanyInfo(): Promise<{ companyName: string; raw: unknown }>;
  /** Returns the *currently active* access token (after any auto-refresh). */
  currentAccessToken(): string;
};

export function createIntuitAccountingClient(
  opts: IntuitClientOptions,
): IntuitAccountingClient {
  const fetchImpl = opts.fetchFn ?? fetch;
  let accessToken = opts.accessToken;
  const env = INTUIT_DISCOVERY[opts.environment];
  const baseUrl = `${env.apiBaseUrl}/v3/company/${opts.realmId}`;

  async function refreshIfPossible(): Promise<boolean> {
    if (!opts.refreshToken) return false;
    const tokens = await refreshAccessToken({
      environment: opts.environment,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      refreshToken: opts.refreshToken,
      fetchFn: fetchImpl,
    });
    accessToken = tokens.access_token;
    if (opts.onTokenRefresh) await opts.onTokenRefresh(tokens);
    return true;
  }

  async function doFetch(
    url: string,
    init: RequestInit,
    attempt = 0,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("Accept", "application/json");
    const res = await fetchImpl(url, { ...init, headers });

    if (res.status === 401 && attempt === 0) {
      const refreshed = await refreshIfPossible();
      if (refreshed) return doFetch(url, init, attempt + 1);
    }

    if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const wait = backoffMs(attempt, res.headers.get("retry-after"));
      await sleep(wait);
      return doFetch(url, init, attempt + 1);
    }

    return res;
  }

  async function jsonRequest<T = unknown>(
    pathOrUrl: string,
    init: RequestInit,
  ): Promise<T> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${baseUrl}${pathOrUrl}`;
    const res = await doFetch(url, init);
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      /* leave parsed null; we'll use raw text below */
    }
    if (!res.ok) {
      const fault = (parsed as { Fault?: { Error?: Array<{ Message?: string; Detail?: string; code?: string }> } })?.Fault;
      const first = fault?.Error?.[0];
      const code = first?.code ?? String(res.status);
      const message =
        first?.Message ?? first?.Detail ?? text ?? `HTTP ${res.status}`;
      throw new IntuitApiError(res.status, code, message, parsed ?? text);
    }
    return parsed as T;
  }

  return {
    async query<T = unknown>(q: string): Promise<T> {
      const url = `${baseUrl}/query?query=${encodeURIComponent(q)}&minorversion=70`;
      return jsonRequest<T>(url, { method: "GET" });
    },
    async postJournalEntry(payload, idempotencyKey) {
      const url = `${baseUrl}/journalentry?minorversion=70&requestid=${encodeURIComponent(idempotencyKey)}`;
      // Intuit's create endpoint expects the JournalEntry object as the
      // top-level JSON body, NOT wrapped under a `JournalEntry` key. If
      // we send `{ JournalEntry: {...} }` Intuit rejects with error 2010
      // ("Property Name:failed to parse json object; a property specified
      // is unsupported or invalid"). Our internal payload shape (and the
      // audit row written to qbo_posting_events.payload) keeps the wrapper
      // for symmetry with Intuit's response shape, so we strip it here at
      // the wire boundary only.
      const requestBody =
        payload &&
        typeof payload === "object" &&
        "JournalEntry" in (payload as Record<string, unknown>)
          ? (payload as { JournalEntry: unknown }).JournalEntry
          : payload;
      const result = await jsonRequest<{ JournalEntry: { Id: string; SyncToken: string } }>(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      return {
        Id: result.JournalEntry.Id,
        SyncToken: result.JournalEntry.SyncToken,
        raw: result,
      };
    },
    async uploadAttachable({
      journalEntryId,
      fileName,
      contentType,
      fileBytes,
      note,
    }) {
      // Intuit's upload endpoint uses a multipart body with two parts:
      //   - file_metadata_0: JSON describing the Attachable
      //   - file_content_0:  the binary file bytes
      // We hand-build the multipart body so we don't need a multipart library.
      const boundary = `----HealthtrixQboBoundary${Date.now()}`;
      const url = `${baseUrl}/upload?minorversion=70`;

      const metadata = {
        AttachableRef: [
          {
            EntityRef: { type: "JournalEntry", value: journalEntryId },
          },
        ],
        FileName: fileName,
        ContentType: contentType,
        Note: note ?? "",
      };

      const parts: Array<Buffer> = [];
      const eol = "\r\n";
      parts.push(Buffer.from(`--${boundary}${eol}`));
      parts.push(
        Buffer.from(
          `Content-Disposition: form-data; name="file_metadata_0"${eol}` +
            `Content-Type: application/json${eol}${eol}`,
        ),
      );
      parts.push(Buffer.from(JSON.stringify(metadata)));
      parts.push(Buffer.from(`${eol}--${boundary}${eol}`));
      parts.push(
        Buffer.from(
          `Content-Disposition: form-data; name="file_content_0"; filename="${fileName.replace(/"/g, "")}"${eol}` +
            `Content-Type: ${contentType}${eol}${eol}`,
        ),
      );
      parts.push(fileBytes);
      parts.push(Buffer.from(`${eol}--${boundary}--${eol}`));
      const body = Buffer.concat(parts);

      const result = await jsonRequest<{
        AttachableResponse: Array<{ Attachable: { Id: string } }>;
      }>(url, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body,
      });
      const id = result.AttachableResponse?.[0]?.Attachable?.Id;
      if (!id) {
        throw new IntuitApiError(
          200,
          "no_attachable_id",
          "Intuit returned an attachable upload response without an Id.",
          result,
        );
      }
      return { Id: id, raw: result };
    },
    async fetchCompanyInfo() {
      const result = await jsonRequest<{
        CompanyInfo: { CompanyName: string };
      }>(`/companyinfo/${opts.realmId}?minorversion=70`, { method: "GET" });
      return {
        companyName: result.CompanyInfo?.CompanyName ?? "",
        raw: result,
      };
    },
    currentAccessToken() {
      return accessToken;
    },
  };
}
