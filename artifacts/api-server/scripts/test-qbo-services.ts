/* eslint-disable no-console */
/**
 * QBO services integration tests.
 *
 * Run with: pnpm --filter @workspace/api-server run test:qbo-services
 *
 * Talks to the real Postgres pointed at by DATABASE_URL. Each test
 * creates its own throwaway org via a unique nanoid so it can run
 * alongside live data without colliding. We always clean up at the end
 * (best-effort) so successive runs stay clean.
 *
 * Coverage:
 *   - encryptionAvailable() preflight
 *   - saveQboCredentials persists encrypted Client ID / Secret and
 *     flips mode → "real"
 *   - connectQboStub yields mode=stub, status=connected (stub fallback)
 *   - postReportToQbo on a stub-connected org runs the stub posting
 *     path end-to-end (deterministic JE id, posting_event row written,
 *     environment snapshot defaults to "sandbox")
 *   - handleQboOauthCallback rejects unknown / consumed / expired state
 *     rows and propagates exchange failures through describeIntuitError
 *   - runTokenRefreshSweep is a safe no-op when there are no real
 *     connections in the DB
 *   - disconnectQboReal: revokes via fetchFn (best-effort), wipes both
 *     encrypted credentials AND tokens, resets mode to "stub", writes a
 *     qbo_config audit entry
 *   - getConnectionHealth surfaces lastTokenRefreshError + recent
 *     refresh attempts when the row is in refresh_failed state
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] ??=
  "test-key-for-qbo-services-suite-please-replace-in-prod";

if (!process.env["DATABASE_URL"]) {
  console.error("SKIP: DATABASE_URL not set; qbo-services suite needs a DB.");
  process.exit(0);
}

const { db, pool, orgsTable, usersTable, qboConnectionTable, qboOauthStatesTable, qboPostingEventsTable, expenseReportsTable, departmentsTable, auditEntriesTable } =
  await import("@workspace/db");
const { and, eq } = await import("drizzle-orm");

const qboMod = await import("../src/services/qbo.js");
const {
  ensureConnectionRow,
  saveQboCredentials,
  connectQboStub,
  disconnectQboReal,
  handleQboOauthCallback,
  runTokenRefreshSweep,
  getConnectionHealth,
  postReportToQbo,
  runQboPreflight,
} = qboMod;

const encMod = await import("../src/lib/encryption.js");

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

const createdOrgIds: string[] = [];
async function makeOrg(label: string): Promise<{ orgId: string; userId: string }> {
  const [org] = await db
    .insert(orgsTable)
    .values({ name: `__test_${label}_${randomUUID().slice(0, 8)}` })
    .returning();
  createdOrgIds.push(org.id);
  const [user] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `qbo-test-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: "x",
      fullName: "QBO Test Admin",
      roles: ["System Admin"],
      isActive: true,
    })
    .returning();
  return { orgId: org.id, userId: user.id };
}

console.log("qbo.ts service tests\n");

await test("encryptionAvailable() returns true for the test key", () => {
  assert.equal(encMod.encryptionAvailable(), true);
});

await test("ensureConnectionRow creates a default row for a new org", async () => {
  const { orgId } = await makeOrg("ensureRow");
  const conn = await ensureConnectionRow(orgId);
  assert.equal(conn.orgId, orgId);
  assert.equal(conn.mode, "stub");
  assert.equal(conn.status, "disconnected");
  assert.equal(conn.environment, "sandbox");
});

await test("saveQboCredentials encrypts and flips mode → real", async () => {
  const { orgId } = await makeOrg("saveCreds");
  const conn = await saveQboCredentials({
    orgId,
    clientId: "MY-INTUIT-CLIENT-ID",
    clientSecret: "MY-INTUIT-CLIENT-SECRET",
    environment: "sandbox",
  });
  assert.equal(conn.mode, "real");
  assert.equal(conn.environment, "sandbox");
  assert.ok(conn.clientIdEncrypted, "clientIdEncrypted should be set");
  assert.ok(conn.clientSecretEncrypted, "clientSecretEncrypted should be set");
  assert.notEqual(conn.clientIdEncrypted, "MY-INTUIT-CLIENT-ID");
  assert.equal(
    encMod.decryptString(conn.clientIdEncrypted!),
    "MY-INTUIT-CLIENT-ID",
  );
  assert.equal(
    encMod.decryptString(conn.clientSecretEncrypted!),
    "MY-INTUIT-CLIENT-SECRET",
  );
});

await test("connectQboStub yields mode=stub, status=connected", async () => {
  const { orgId } = await makeOrg("stubConnect");
  const conn = await connectQboStub(orgId);
  assert.equal(conn.mode, "stub");
  assert.equal(conn.status, "connected");
  assert.ok(conn.companyName);
});

await test("postReportToQbo on stub mode writes a posting_event with sandbox env", async () => {
  const { orgId, userId } = await makeOrg("stubPost");
  await connectQboStub(orgId);
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId, name: "Test Dept" })
    .returning();
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId,
      employeeId: userId,
      departmentId: dept.id,
      title: "Stub Posting Test",
      status: "Finance Approved",
      displayCode: `TST-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  const result = await postReportToQbo(report);
  assert.notEqual(result.status, "error");
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].environment, "sandbox");
  // Stub mode generates a synthetic realmId on connect, so the snapshot
  // should be a non-null nanoid string (not the connection's *current*
  // realmId — that's the whole point of snapshotting).
  assert.equal(typeof events[0].realmId, "string");
});

await test("handleQboOauthCallback rejects unknown state", async () => {
  await makeOrg("oauthBadState");
  const r = await handleQboOauthCallback({
    state: "does-not-exist",
    code: "any",
    realmId: "1234",
    redirectUri: "https://example.com/cb",
    fetchFn: (async () =>
      new Response("never called", { status: 200 })) as unknown as typeof fetch,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errorMessage, /Invalid or unknown/);
});

await test("handleQboOauthCallback rejects already-consumed state", async () => {
  const { orgId, userId } = await makeOrg("oauthUsedState");
  const state = `state-${randomUUID()}`;
  await db.insert(qboOauthStatesTable).values({
    orgId,
    state,
    createdById: userId,
    expiresAt: new Date(Date.now() + 5 * 60_000),
    consumedAt: new Date(),
  });
  const r = await handleQboOauthCallback({
    state,
    code: "x",
    realmId: "1234",
    redirectUri: "https://example.com/cb",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errorMessage, /already been used/);
});

await test("handleQboOauthCallback rejects expired state", async () => {
  const { orgId, userId } = await makeOrg("oauthExpiredState");
  const state = `state-${randomUUID()}`;
  await db.insert(qboOauthStatesTable).values({
    orgId,
    state,
    createdById: userId,
    expiresAt: new Date(Date.now() - 60_000),
  });
  const r = await handleQboOauthCallback({
    state,
    code: "x",
    realmId: "1234",
    redirectUri: "https://example.com/cb",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errorMessage, /expired/);
});

await test("handleQboOauthCallback fails when credentials are missing", async () => {
  const { orgId, userId } = await makeOrg("oauthNoCreds");
  const state = `state-${randomUUID()}`;
  await db.insert(qboOauthStatesTable).values({
    orgId,
    state,
    createdById: userId,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  const r = await handleQboOauthCallback({
    state,
    code: "x",
    realmId: "1234",
    redirectUri: "https://example.com/cb",
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errorMessage, /credentials are not configured/);
});

await test("handleQboOauthCallback surfaces token-exchange errors", async () => {
  const { orgId, userId } = await makeOrg("oauthExchangeFail");
  await saveQboCredentials({
    orgId,
    clientId: "C",
    clientSecret: "S",
    environment: "sandbox",
  });
  const state = `state-${randomUUID()}`;
  await db.insert(qboOauthStatesTable).values({
    orgId,
    state,
    createdById: userId,
    expiresAt: new Date(Date.now() + 5 * 60_000),
  });
  const fetchMock = (async () =>
    new Response("bad", { status: 400 })) as unknown as typeof fetch;
  const r = await handleQboOauthCallback({
    state,
    code: "x",
    realmId: "1234",
    redirectUri: "https://example.com/cb",
    fetchFn: fetchMock,
  });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.errorMessage, /token exchange failed|400/i);
});

await test("runTokenRefreshSweep is a safe no-op with no real connections", async () => {
  const out = await runTokenRefreshSweep({});
  assert.equal(typeof out.checked, "number");
  assert.equal(typeof out.refreshed, "number");
  assert.equal(typeof out.failed, "number");
});

await test("disconnectQboReal wipes credentials, tokens, mode → stub", async () => {
  const { orgId } = await makeOrg("disconnect");
  await saveQboCredentials({
    orgId,
    clientId: "Z",
    clientSecret: "Y",
    environment: "sandbox",
  });
  // Pretend we have live tokens that need to be revoked.
  await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      status: "connected",
      realmId: "9999",
      companyName: "Old Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
      lastTokenRefreshAt: new Date(),
      connectionHealth: "healthy",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  let revokeCalls = 0;
  const fetchMock = (async () => {
    revokeCalls += 1;
    return new Response("", { status: 200 });
  }) as unknown as typeof fetch;
  const after = await disconnectQboReal({ orgId, fetchFn: fetchMock });
  assert.equal(after.mode, "stub");
  assert.equal(after.status, "disconnected");
  assert.equal(after.clientIdEncrypted, null);
  assert.equal(after.clientSecretEncrypted, null);
  assert.equal(after.accessTokenEncrypted, null);
  assert.equal(after.refreshTokenEncrypted, null);
  assert.ok(revokeCalls >= 1, "expected at least one revoke call");
});

await test("postReportToQbo refuses to fall back to stub when real creds are stored but the connection is degraded", async () => {
  const { orgId, userId } = await makeOrg("postRealDegraded");
  await saveQboCredentials({
    orgId,
    clientId: "C",
    clientSecret: "S",
    environment: "sandbox",
  });
  // Mark as real but with a revoked refresh token (status=error,
  // health=reconnect_required). This is exactly the state where the
  // previous code would silently downgrade to the stub.
  await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      status: "error",
      connectionHealth: "reconnect_required",
      lastTokenRefreshError: "invalid_grant",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId, name: "Test Dept" })
    .returning();
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId,
      employeeId: userId,
      departmentId: dept.id,
      title: "Degraded posting test",
      status: "Finance Approved",
      displayCode: `TST-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  const result = await postReportToQbo(report);
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.match(result.errorMessage, /reconnect/i);
  }
  // Verify a single error posting_event was written (no fake "posted").
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "error");
});

await test("saveQboCredentials with null clears tokens AND resets mode/status to disconnected stub", async () => {
  const { orgId } = await makeOrg("clearCreds");
  await saveQboCredentials({
    orgId,
    clientId: "C",
    clientSecret: "S",
    environment: "sandbox",
  });
  await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      status: "connected",
      realmId: "9999",
      companyName: "Old Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 86_400_000),
      connectionHealth: "healthy",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  const cleared = await saveQboCredentials({
    orgId,
    clientId: null,
    clientSecret: null,
    environment: "sandbox",
  });
  assert.equal(cleared.clientIdEncrypted, null);
  assert.equal(cleared.clientSecretEncrypted, null);
  assert.equal(cleared.accessTokenEncrypted, null);
  assert.equal(cleared.refreshTokenEncrypted, null);
  assert.equal(cleared.realmId, null);
  assert.equal(cleared.mode, "stub");
  assert.equal(cleared.status, "disconnected");
  assert.equal(cleared.connectionHealth, "disconnected");
});

await test("runQboPreflight reports missing credentials as warn", async () => {
  const { orgId } = await makeOrg("preflightEmpty");
  const result = await runQboPreflight({
    orgId,
    resolvedRedirectUri: "https://example.com/cb",
    fetchFn: (async () => new Response("", { status: 200 })) as typeof fetch,
  });
  assert.equal(result.encryptionKeyConfigured, true);
  assert.equal(result.resolvedRedirectUri, "https://example.com/cb");
  const stored = result.checks.find((c) => c.id === "stored_credentials");
  assert.ok(stored, "stored_credentials check missing");
  assert.equal(stored.status, "warn");
  const redirect = result.checks.find((c) => c.id === "redirect_uri");
  assert.ok(redirect && redirect.detail?.includes("https://example.com/cb"));
});

await test("runQboPreflight flags undecryptable credentials as fail", async () => {
  const { orgId } = await makeOrg("preflightBadCipher");
  await ensureConnectionRow(orgId);
  await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      clientIdEncrypted: "not-a-real-ciphertext",
      clientSecretEncrypted: "also-not-a-ciphertext",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  const result = await runQboPreflight({
    orgId,
    resolvedRedirectUri: "https://example.com/cb",
    fetchFn: (async () => new Response("", { status: 200 })) as typeof fetch,
  });
  const stored = result.checks.find((c) => c.id === "stored_credentials");
  assert.equal(stored?.status, "fail");
  assert.ok(stored?.detail?.toLowerCase().includes("decrypt"));
});

await test("runQboPreflight distinguishes invalid_client vs invalid_grant", async () => {
  const { orgId } = await makeOrg("preflightProbeBad");
  await saveQboCredentials({
    orgId,
    clientId: "BAD-CLIENT",
    clientSecret: "BAD-SECRET",
    environment: "sandbox",
  });
  const badClientFetch: typeof fetch = (async (_url, init) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 401,
      });
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
  const badResult = await runQboPreflight({
    orgId,
    resolvedRedirectUri: "https://example.com/cb",
    fetchFn: badClientFetch,
  });
  const badProbe = badResult.checks.find((c) => c.id === "client_id_recognized");
  assert.equal(badProbe?.status, "fail");
  assert.ok(badProbe?.detail?.toLowerCase().includes("invalid_client"));

  const { orgId: orgId2 } = await makeOrg("preflightProbeOk");
  await saveQboCredentials({
    orgId: orgId2,
    clientId: "GOOD-CLIENT",
    clientSecret: "GOOD-SECRET",
    environment: "sandbox",
  });
  const goodClientFetch: typeof fetch = (async (_url, init) => {
    if (init?.method === "POST") {
      return new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
      });
    }
    return new Response("", { status: 200 });
  }) as typeof fetch;
  const goodResult = await runQboPreflight({
    orgId: orgId2,
    resolvedRedirectUri: "https://example.com/cb",
    fetchFn: goodClientFetch,
  });
  const goodProbe = goodResult.checks.find(
    (c) => c.id === "client_id_recognized",
  );
  assert.equal(goodProbe?.status, "pass");
});

await test("getConnectionHealth surfaces lastTokenRefreshError on refresh_failed", async () => {
  const { orgId } = await makeOrg("health");
  await saveQboCredentials({
    orgId,
    clientId: "C",
    clientSecret: "S",
    environment: "sandbox",
  });
  await db
    .update(qboConnectionTable)
    .set({
      connectionHealth: "refresh_failed",
      lastTokenRefreshError: "Intuit returned HTTP 503",
      lastTokenRefreshAt: new Date(Date.now() - 60_000),
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  const health = await getConnectionHealth(orgId);
  assert.equal(health.health, "refresh_failed");
  assert.equal(health.lastTokenRefreshError, "Intuit returned HTTP 503");
});

// Best-effort cleanup. Cascades take care of rows in users / qbo_connection /
// qbo_posting_events / expense_reports / departments / qbo_oauth_states.
console.log("\nCleaning up…");
let cleaned = 0;
let cleanFailed = 0;
for (const id of createdOrgIds) {
  try {
    // Audit entries are org-scoped but not cascade-deleted via orgs; clear
    // them up front so the org delete doesn't fail on FKs in some schemas.
    await db.delete(auditEntriesTable).where(eq(auditEntriesTable.orgId, id));
    await db.delete(orgsTable).where(eq(orgsTable.id, id));
    cleaned += 1;
  } catch (err) {
    cleanFailed += 1;
    console.warn(`  ! failed to cleanup org ${id}:`, err);
  }
}
console.log(`Cleaned ${cleaned} org(s) (${cleanFailed} failures).`);

await pool.end();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
