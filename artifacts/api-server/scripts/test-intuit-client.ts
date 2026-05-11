/* eslint-disable no-console */
/**
 * Intuit client unit tests.
 *
 * Run with: pnpm --filter @workspace/api-server run test:intuit
 *
 * These tests use an injected `fetchFn` to simulate Intuit's OAuth and
 * Accounting API endpoints — no network required. They cover:
 *   - buildAuthorizationUrl: scope + redirect_uri + state propagation,
 *     environment-specific endpoint selection
 *   - exchangeCodeForTokens: success + error mapping
 *   - refreshAccessToken: success, generic failure, invalid_grant ⇒
 *     refresh_token_revoked code path
 *   - revokeToken: success + 400 (already-invalid) treated as success
 *   - createIntuitAccountingClient: 401 → auto-refresh → retry,
 *     5xx → exponential backoff retry, JournalEntry POST + Attachable
 *     upload happy paths
 *   - describeIntuitError: refresh-revoked + throttled mapping
 */
import assert from "node:assert/strict";

const mod = await import("../src/services/intuitClient.js");
const {
  INTUIT_DISCOVERY,
  IntuitApiError,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  revokeToken,
  createIntuitAccountingClient,
  describeIntuitError,
} = mod;

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(err);
  }
}

function makeFetchMock(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init ?? {});
  };
}

console.log("intuitClient.ts unit tests\n");

await test("buildAuthorizationUrl includes scope, redirect_uri, state", () => {
  const url = buildAuthorizationUrl({
    environment: "sandbox",
    clientId: "abc",
    redirectUri: "https://example.com/api/admin/qbo-connection/oauth/callback",
    state: "xyz-state-123",
  });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, INTUIT_DISCOVERY.sandbox.authorizationEndpoint);
  assert.equal(u.searchParams.get("client_id"), "abc");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("scope"), "com.intuit.quickbooks.accounting");
  assert.equal(
    u.searchParams.get("redirect_uri"),
    "https://example.com/api/admin/qbo-connection/oauth/callback",
  );
  assert.equal(u.searchParams.get("state"), "xyz-state-123");
});

await test("buildAuthorizationUrl picks production endpoint when env=production", () => {
  const url = buildAuthorizationUrl({
    environment: "production",
    clientId: "x",
    redirectUri: "https://example.com/cb",
    state: "s",
  });
  assert.ok(url.startsWith(INTUIT_DISCOVERY.production.authorizationEndpoint));
});

await test("exchangeCodeForTokens returns parsed token response on 200", async () => {
  const fetchMock = makeFetchMock(async (url, init) => {
    assert.equal(url, INTUIT_DISCOVERY.sandbox.tokenEndpoint);
    assert.equal(init.method, "POST");
    const body = String(init.body);
    assert.ok(body.includes("grant_type=authorization_code"));
    assert.ok(body.includes("code=auth-code"));
    return new Response(
      JSON.stringify({
        access_token: "AT",
        refresh_token: "RT",
        expires_in: 3600,
        x_refresh_token_expires_in: 8640000,
        token_type: "bearer",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const tokens = await exchangeCodeForTokens({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    redirectUri: "https://example.com/cb",
    code: "auth-code",
    fetchFn: fetchMock,
  });
  assert.equal(tokens.access_token, "AT");
  assert.equal(tokens.refresh_token, "RT");
  assert.equal(tokens.expires_in, 3600);
});

await test("exchangeCodeForTokens throws IntuitApiError on non-200", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response("bad request", { status: 400 }),
  );
  await assert.rejects(
    () =>
      exchangeCodeForTokens({
        environment: "sandbox",
        clientId: "id",
        clientSecret: "secret",
        redirectUri: "https://example.com/cb",
        code: "bad",
        fetchFn: fetchMock,
      }),
    (err: unknown) => {
      assert.ok(err instanceof IntuitApiError);
      assert.equal(err.status, 400);
      assert.equal(err.code, "token_exchange_failed");
      return true;
    },
  );
});

await test("refreshAccessToken happy path returns new tokens", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response(
      JSON.stringify({
        access_token: "AT2",
        refresh_token: "RT2",
        expires_in: 3600,
        x_refresh_token_expires_in: 8640000,
        token_type: "bearer",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  const tokens = await refreshAccessToken({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    refreshToken: "old",
    fetchFn: fetchMock,
  });
  assert.equal(tokens.access_token, "AT2");
  assert.equal(tokens.refresh_token, "RT2");
});

await test("refreshAccessToken maps invalid_grant to refresh_token_revoked", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }),
  );
  await assert.rejects(
    () =>
      refreshAccessToken({
        environment: "sandbox",
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "expired",
        fetchFn: fetchMock,
      }),
    (err: unknown) => {
      assert.ok(err instanceof IntuitApiError);
      assert.equal(err.code, "refresh_token_revoked");
      return true;
    },
  );
});

await test("refreshAccessToken on 500 throws generic refresh_failed", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response("oops", { status: 500 }),
  );
  await assert.rejects(
    () =>
      refreshAccessToken({
        environment: "sandbox",
        clientId: "id",
        clientSecret: "secret",
        refreshToken: "any",
        fetchFn: fetchMock,
      }),
    (err: unknown) => {
      assert.ok(err instanceof IntuitApiError);
      assert.equal(err.code, "refresh_failed");
      assert.equal(err.status, 500);
      return true;
    },
  );
});

await test("revokeToken treats 400 as success (already-invalid token)", async () => {
  let calls = 0;
  const fetchMock = makeFetchMock(async () => {
    calls += 1;
    return new Response("token already invalid", { status: 400 });
  });
  await revokeToken({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    token: "old-rt",
    fetchFn: fetchMock,
  });
  assert.equal(calls, 1);
});

await test("revokeToken throws on 5xx", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response("server down", { status: 500 }),
  );
  await assert.rejects(() =>
    revokeToken({
      environment: "sandbox",
      clientId: "id",
      clientSecret: "secret",
      token: "any",
      fetchFn: fetchMock,
    }),
  );
});

await test("createIntuitAccountingClient retries on 401 with auto-refresh", async () => {
  let apiCalls = 0;
  let refreshCalls = 0;
  let refreshCb = 0;
  const fetchMock = makeFetchMock(async (url) => {
    if (url === INTUIT_DISCOVERY.sandbox.tokenEndpoint) {
      refreshCalls += 1;
      return new Response(
        JSON.stringify({
          access_token: "FRESH",
          refresh_token: "RT3",
          expires_in: 3600,
          x_refresh_token_expires_in: 8640000,
          token_type: "bearer",
        }),
        { status: 200 },
      );
    }
    apiCalls += 1;
    if (apiCalls === 1) return new Response("expired", { status: 401 });
    return new Response(
      JSON.stringify({ CompanyInfo: { CompanyName: "Acme" } }),
      { status: 200 },
    );
  });
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "stale",
    refreshToken: "rt",
    fetchFn: fetchMock,
    onTokenRefresh: async () => {
      refreshCb += 1;
    },
  });
  const info = await client.fetchCompanyInfo();
  assert.equal(info.companyName, "Acme");
  assert.equal(refreshCalls, 1);
  assert.equal(refreshCb, 1);
  assert.equal(apiCalls, 2);
  assert.equal(client.currentAccessToken(), "FRESH");
});

await test("createIntuitAccountingClient retries on 5xx with backoff", async () => {
  let calls = 0;
  const fetchMock = makeFetchMock(async (url) => {
    if (url === INTUIT_DISCOVERY.sandbox.tokenEndpoint) {
      throw new Error("should not refresh on 5xx");
    }
    calls += 1;
    if (calls < 3) return new Response("oops", { status: 503 });
    return new Response(
      JSON.stringify({ JournalEntry: { Id: "JE-1", SyncToken: "0" } }),
      { status: 200 },
    );
  });
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "AT",
    refreshToken: null,
    fetchFn: fetchMock,
  });
  const result = await client.postJournalEntry({ Line: [] }, "key-1");
  assert.equal(result.Id, "JE-1");
  assert.ok(calls >= 3, "should have retried at least twice");
});

await test("postJournalEntry strips the JournalEntry wrapper before sending the body", async () => {
  // Regression guard for task #89 follow-up: Intuit's create endpoint
  // rejects bodies wrapped under a top-level `JournalEntry` key with the
  // generic "invalid or unsupported property" error. Our internal payload
  // shape (and the qbo_posting_events.payload audit row) keeps the
  // wrapper for symmetry with Intuit's response shape, so the client
  // must strip it at the wire boundary.
  let capturedBody: string | null = null;
  const fetchMock = makeFetchMock(async (_url, init) => {
    capturedBody = String(init.body);
    return new Response(
      JSON.stringify({ JournalEntry: { Id: "JE-7", SyncToken: "0" } }),
      { status: 200 },
    );
  });
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "AT",
    refreshToken: null,
    fetchFn: fetchMock,
  });
  const wrapped = {
    JournalEntry: {
      DocNumber: "TEST-001",
      Line: [
        {
          Amount: 1,
          DetailType: "JournalEntryLineDetail",
          JournalEntryLineDetail: {
            PostingType: "Debit",
            AccountRef: { value: "1" },
          },
        },
      ],
    },
  };
  const result = await client.postJournalEntry(wrapped, "k-wrap");
  assert.equal(result.Id, "JE-7");
  assert.ok(capturedBody, "expected the client to send a request body");
  const parsed = JSON.parse(capturedBody!) as Record<string, unknown>;
  assert.ok(
    !("JournalEntry" in parsed),
    "wire body must not include the JournalEntry wrapper",
  );
  assert.equal(parsed.DocNumber, "TEST-001");
  assert.ok(Array.isArray(parsed.Line));
});

await test("postJournalEntry passes through an already-unwrapped body unchanged", async () => {
  let capturedBody: string | null = null;
  const fetchMock = makeFetchMock(async (_url, init) => {
    capturedBody = String(init.body);
    return new Response(
      JSON.stringify({ JournalEntry: { Id: "JE-8", SyncToken: "0" } }),
      { status: 200 },
    );
  });
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "AT",
    refreshToken: null,
    fetchFn: fetchMock,
  });
  const unwrapped = { DocNumber: "TEST-002", Line: [] };
  await client.postJournalEntry(unwrapped, "k-flat");
  const parsed = JSON.parse(capturedBody!) as Record<string, unknown>;
  assert.equal(parsed.DocNumber, "TEST-002");
});

await test("postJournalEntry surfaces Intuit Fault errors", async () => {
  const fetchMock = makeFetchMock(async () =>
    new Response(
      JSON.stringify({
        Fault: {
          Error: [
            {
              Message: "Validation Exception",
              Detail: "Account is not active.",
              code: "6000",
            },
          ],
        },
      }),
      { status: 400 },
    ),
  );
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "AT",
    refreshToken: null,
    fetchFn: fetchMock,
  });
  await assert.rejects(
    () => client.postJournalEntry({ Line: [] }, "k"),
    (err: unknown) => {
      assert.ok(err instanceof IntuitApiError);
      assert.equal(err.code, "6000");
      assert.match(String(err.message), /Validation Exception|Account/);
      return true;
    },
  );
});

await test("uploadAttachable sends multipart and returns Id", async () => {
  let sawMultipart = false;
  const fetchMock = makeFetchMock(async (_url, init) => {
    const ct = String(new Headers(init.headers).get("content-type") ?? "");
    if (ct.startsWith("multipart/form-data")) sawMultipart = true;
    return new Response(
      JSON.stringify({ AttachableResponse: [{ Attachable: { Id: "ATT-1" } }] }),
      { status: 200 },
    );
  });
  const client = createIntuitAccountingClient({
    environment: "sandbox",
    clientId: "id",
    clientSecret: "secret",
    realmId: "1234",
    accessToken: "AT",
    refreshToken: null,
    fetchFn: fetchMock,
  });
  const out = await client.uploadAttachable({
    journalEntryId: "JE-1",
    fileName: "receipt.png",
    contentType: "image/png",
    fileBytes: Buffer.from([1, 2, 3, 4]),
    note: "n",
  });
  assert.equal(out.Id, "ATT-1");
  assert.equal(sawMultipart, true);
});

await test("describeIntuitError maps refresh-revoked + throttled cases", () => {
  assert.match(
    describeIntuitError(
      new IntuitApiError(400, "refresh_token_revoked", "raw"),
    ),
    /Reconnect required/,
  );
  assert.match(
    describeIntuitError(new IntuitApiError(429, "throttled", "raw")),
    /rate-limited/i,
  );
  assert.equal(describeIntuitError(new Error("boom")), "boom");
  assert.equal(describeIntuitError("plain string"), "plain string");
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
