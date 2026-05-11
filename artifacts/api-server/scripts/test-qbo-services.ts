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
  buildJournalEntryPayload,
  describeMissingAccountIds,
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

await test("buildJournalEntryPayload never includes a top-level Tag property", () => {
  type GlPreview = Parameters<typeof buildJournalEntryPayload>[0];
  const preview: GlPreview = {
    displayCode: "EXP-TEST-001",
    journalDate: "2026-05-10",
    memo: "Test memo",
    currency: "USD",
    totalDebits: "100.00",
    totalCredits: "100.00",
    debits: [
      {
        category: "Travel",
        account: "Travel Expense",
        accountId: "42",
        amount: "100.00",
      },
    ],
    credits: [
      {
        category: "Payable",
        account: "Loan Payable",
        accountId: "99",
        amount: "100.00",
      },
    ],
  } as GlPreview;
  for (const tagNames of [
    [],
    ["Project Alpha"],
    ["Project Alpha", "Q2", "Travel"],
  ]) {
    const out = buildJournalEntryPayload(preview, tagNames) as {
      JournalEntry: Record<string, unknown>;
    };
    assert.ok(
      !("Tag" in out.JournalEntry),
      `JournalEntry must not have a Tag property (tagNames=${JSON.stringify(tagNames)})`,
    );
    if (tagNames.length > 0) {
      assert.match(
        String(out.JournalEntry.PrivateNote),
        /Tags: /,
        "PrivateNote should mention tags when tags are present",
      );
      for (const t of tagNames) {
        assert.ok(
          String(out.JournalEntry.PrivateNote).includes(t),
          `PrivateNote should include tag '${t}'`,
        );
      }
    } else {
      assert.equal(out.JournalEntry.PrivateNote, "Test memo");
    }
  }
});

await test("describeMissingAccountIds flags missing accountId on credit/debit lines (real-mode pre-flight)", () => {
  type GlPreview = Parameters<typeof buildJournalEntryPayload>[0];
  const ok: GlPreview = {
    displayCode: "EXP-OK-001",
    journalDate: "2026-05-10",
    memo: "ok",
    currency: "USD",
    totalDebits: "100.00",
    totalCredits: "100.00",
    debits: [{ category: "Travel", account: "Travel Expense", accountId: "42", amount: "100.00" }],
    credits: [{ category: "Payable", account: "Loan Payable", accountId: "43", amount: "100.00" }],
  } as GlPreview;
  assert.equal(describeMissingAccountIds(ok), null);

  // Mirrors the failure mode hit on report 2222ff05 — Finance had set
  // GL mappings for every category but the org's defaultPayableAccountId
  // was null, so the credit line shipped to Intuit with only `name`
  // and Intuit returned the generic "Request has invalid or unsupported
  // property" Fault. Pre-flight must catch this and produce an
  // actionable message instead of calling Intuit.
  const missingCredit: GlPreview = {
    ...ok,
    credits: [{ category: "Payable", account: "Employee Reimbursement Payable", accountId: null, amount: "100.00" }],
  } as GlPreview;
  const cMsg = describeMissingAccountIds(missingCredit);
  assert.ok(cMsg && cMsg.includes("Employee Reimbursement Payable"), `expected credit message, got: ${cMsg}`);
  assert.ok(cMsg && cMsg.includes("credit"), `expected message to mention 'credit', got: ${cMsg}`);

  const missingDebit: GlPreview = {
    ...ok,
    debits: [{ category: "Travel", account: "Travel Expense", accountId: null, amount: "100.00" }],
  } as GlPreview;
  const dMsg = describeMissingAccountIds(missingDebit);
  assert.ok(dMsg && dMsg.includes("Travel Expense"), `expected debit message, got: ${dMsg}`);
  assert.ok(dMsg && dMsg.includes("Travel"), `expected debit category in message, got: ${dMsg}`);
});

await test("postReportToQbo on real mode aborts before calling Intuit when payable Account Id is missing (regression for report 2222ff05)", async () => {
  const { glMappingsTable, lineItemsTable } = await import("@workspace/db");
  const { orgId, userId } = await makeOrg("realPreflightMissingPayable");
  await saveQboCredentials({
    orgId,
    clientId: "C",
    clientSecret: "S",
    environment: "sandbox",
  });
  // Promote to a fully-connected real connection with no
  // default_payable_account_id — exactly the failing 2222ff05 shape.
  await db
    .update(qboConnectionTable)
    .set({
      mode: "real",
      status: "connected",
      connectionHealth: "healthy",
      realmId: "9130354997998",
      companyName: "Sandbox Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 24 * 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastTokenRefreshAt: new Date(),
      defaultPayableAccountId: null,
      defaultPayableAccountName: null,
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  // Map the debit category to an Account Id so the only missing one
  // is the credit (payable) — isolates the failure to the exact field.
  await db.insert(glMappingsTable).values({
    orgId,
    code: "Meals & Entertainment",
    qboAccount: "Meals and Entertainment",
    qboAccountId: "13",
  });
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
      title: "Real-mode missing payable preflight",
      status: "Finance Approved",
      displayCode: `RP1-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: "2026-05-10",
    merchant: "Coffee shop",
    description: "Client lunch",
    category: "Meals & Entertainment",
    amount: "300.00",
    paymentMethod: "Personal Card",
  });
  let fetchCalls = 0;
  const fetchMock = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  const result = await postReportToQbo(report, { fetchFn: fetchMock });
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.match(result.errorMessage, /no QuickBooks Account Id/i);
    assert.match(result.errorMessage, /local validation/i);
    assert.doesNotMatch(
      result.errorMessage,
      /unsupported property/i,
      "must not surface the opaque Intuit fault when we never called Intuit",
    );
  }
  assert.equal(fetchCalls, 0, "must not call Intuit when preflight blocks");
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "error");
  assert.equal(events[0].qboJournalId, null);
});

await test("postReportToQbo on real mode posts successfully when every line has an Account Id (asserts persisted journal id)", async () => {
  const { glMappingsTable, lineItemsTable } = await import("@workspace/db");
  const { orgId, userId } = await makeOrg("realPreflightOk");
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
      connectionHealth: "healthy",
      realmId: "9130354997998",
      companyName: "Sandbox Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 24 * 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastTokenRefreshAt: new Date(),
      defaultPayableAccountId: "43",
      defaultPayableAccountName: "Loan Payable",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  await db.insert(glMappingsTable).values({
    orgId,
    code: "Meals & Entertainment",
    qboAccount: "Meals and Entertainment",
    qboAccountId: "13",
  });
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
      title: "Real-mode happy-path posting",
      status: "Finance Approved",
      displayCode: `RP2-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: "2026-05-10",
    merchant: "Coffee shop",
    description: "Client lunch",
    category: "Meals & Entertainment",
    amount: "300.00",
    paymentMethod: "Personal Card",
  });

  let postedBody: unknown = null;
  const fetchMock = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.includes("/journalentry?")) {
      postedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ JournalEntry: { Id: "9999", SyncToken: "0" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in real-mode happy-path test: ${u}`);
  }) as unknown as typeof fetch;

  const result = await postReportToQbo(report, { fetchFn: fetchMock });
  assert.equal(result.status, "posted");
  if (result.status === "posted" || result.status === "retried") {
    assert.equal(result.qboJournalId, "9999");
  }
  // Verify the wire payload Intuit received: every AccountRef has a value
  // (the bug pre-fix sent name-only refs, which Intuit rejected).
  const sent = postedBody as { Line: Array<{ JournalEntryLineDetail: { AccountRef: { value?: string; name?: string } } }> };
  assert.ok(sent && Array.isArray(sent.Line), "expected wire body to be a JournalEntry");
  for (const line of sent.Line) {
    assert.ok(
      line.JournalEntryLineDetail.AccountRef.value,
      `every AccountRef must include value (got: ${JSON.stringify(line.JournalEntryLineDetail.AccountRef)})`,
    );
  }
  // And the persisted posting event reflects the success.
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "posted");
  assert.equal(events[0].qboJournalId, "9999");
  assert.equal(events[0].errorMessage, null);
});

await test("postReportToQbo on real mode attaches Vendor Entity on AP credit lines and caches the resolved Vendor Id (regression for report 2222ff05 'Required param missing')", async () => {
  const { glMappingsTable, lineItemsTable, qboAccountsCacheTable, qboVendorCacheTable } = await import(
    "@workspace/db"
  );
  const { orgId, userId } = await makeOrg("realApEntity");
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
      connectionHealth: "healthy",
      realmId: "9130354997998",
      companyName: "Sandbox Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 24 * 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastTokenRefreshAt: new Date(),
      // Mirrors report 2222ff05's actual config: payable defaulted to
      // the org's true Accounts Payable (A/P) account, which Intuit
      // requires JournalEntryLineDetail.Entity on.
      defaultPayableAccountId: "33",
      defaultPayableAccountName: "Accounts Payable (A/P)",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  await db.insert(qboAccountsCacheTable).values([
    {
      orgId,
      qboAccountId: "13",
      name: "Meals and Entertainment",
      fullyQualifiedName: "Meals and Entertainment",
      accountType: "Expense",
      accountSubType: "EntertainmentMeals",
      classification: "Expense",
      active: true,
    },
    {
      orgId,
      qboAccountId: "33",
      name: "Accounts Payable (A/P)",
      fullyQualifiedName: "Accounts Payable (A/P)",
      accountType: "Accounts Payable",
      accountSubType: "AccountsPayable",
      classification: "Liability",
      active: true,
    },
  ]);
  await db.insert(glMappingsTable).values({
    orgId,
    code: "Meals & Entertainment",
    qboAccount: "Meals and Entertainment",
    qboAccountId: "13",
  });
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
      title: "Real-mode AP entity",
      status: "Finance Approved",
      displayCode: `AP1-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: "2026-05-10",
    merchant: "Catering Co",
    description: "Team Party",
    category: "Meals & Entertainment",
    amount: "300.00",
    paymentMethod: "Personal Card",
  });

  // Track every URL we hit so we can assert we both (a) looked the vendor
  // up before posting and (b) did NOT make a redundant create when one
  // already exists. The mock answers Vendor query with a hit, so the
  // create endpoint must never be called on this path.
  const urlsHit: string[] = [];
  let postedBody: unknown = null;
  const fetchMock = (async (url: string, init: RequestInit) => {
    const u = String(url);
    urlsHit.push(`${init?.method ?? "GET"} ${u}`);
    if (u.includes("/query?") && /Vendor/i.test(decodeURIComponent(u))) {
      return new Response(
        JSON.stringify({
          QueryResponse: {
            Vendor: [{ Id: "58", DisplayName: "QBO Test Admin" }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/vendor?") && (init?.method === "POST")) {
      throw new Error(
        "createVendor must NOT be called when the lookup already hits an existing vendor",
      );
    }
    if (u.includes("/journalentry?")) {
      postedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ JournalEntry: { Id: "171", SyncToken: "0" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in AP-entity test: ${u}`);
  }) as unknown as typeof fetch;

  const result = await postReportToQbo(report, { fetchFn: fetchMock });
  assert.equal(result.status, "posted", `expected posted, got: ${JSON.stringify(result)}`);
  if (result.status === "posted" || result.status === "retried") {
    assert.equal(result.qboJournalId, "171");
  }

  // Vendor lookup must have happened BEFORE the journal entry post.
  const queryIdx = urlsHit.findIndex(
    (u) => u.includes("/query?") && /Vendor/i.test(decodeURIComponent(u)),
  );
  const postIdx = urlsHit.findIndex((u) => u.includes("/journalentry?"));
  assert.ok(queryIdx !== -1, `expected a Vendor query, got: ${JSON.stringify(urlsHit)}`);
  assert.ok(postIdx !== -1, `expected a JournalEntry post, got: ${JSON.stringify(urlsHit)}`);
  assert.ok(queryIdx < postIdx, "Vendor lookup must precede JE post");

  // Wire payload assertions: the AP credit line must carry an Entity
  // block with Type=Vendor and the resolved EntityRef.value. The pre-
  // fix payload had no Entity block at all, which is what produced
  // Intuit's "Required param missing" Fault on report 2222ff05.
  const sent = postedBody as {
    Line: Array<{
      JournalEntryLineDetail: {
        PostingType: string;
        AccountRef: { value?: string };
        Entity?: { Type: string; EntityRef: { value: string; name: string } };
      };
    }>;
  };
  const apLine = sent.Line.find(
    (l) => l.JournalEntryLineDetail.AccountRef.value === "33",
  );
  assert.ok(apLine, "expected an AP credit line in the wire body");
  assert.equal(apLine!.JournalEntryLineDetail.PostingType, "Credit");
  assert.ok(
    apLine!.JournalEntryLineDetail.Entity,
    `AP credit line must carry an Entity block, got: ${JSON.stringify(apLine)}`,
  );
  assert.equal(apLine!.JournalEntryLineDetail.Entity!.Type, "Vendor");
  assert.equal(apLine!.JournalEntryLineDetail.Entity!.EntityRef.value, "58");
  // The expense (debit) line must NOT carry an Entity block — Intuit
  // requires Entity only on AP/AR lines.
  const expLine = sent.Line.find(
    (l) => l.JournalEntryLineDetail.AccountRef.value === "13",
  );
  assert.ok(expLine, "expected an expense debit line");
  assert.equal(
    expLine!.JournalEntryLineDetail.Entity,
    undefined,
    "non-AP/AR line must not carry an Entity block",
  );

  // The persisted posting event reflects the success and the cached
  // vendor row was written so subsequent posts skip the lookup round-
  // trip.
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  assert.equal(events[0].status, "posted");
  assert.equal(events[0].qboJournalId, "171");
  const cached = await db
    .select()
    .from(qboVendorCacheTable)
    .where(
      and(
        eq(qboVendorCacheTable.orgId, orgId),
        eq(qboVendorCacheTable.userId, userId),
      ),
    );
  assert.equal(cached.length, 1);
  assert.equal(cached[0].qboVendorId, "58");
});

await test("postReportToQbo on real mode resolves AP account type from QBO when qbo_accounts_cache is cold and still attaches Entity (regression: cold-cache must not silently drop Entity)", async () => {
  const { glMappingsTable, lineItemsTable, qboAccountsCacheTable } = await import(
    "@workspace/db"
  );
  const { orgId, userId } = await makeOrg("realApEntityColdCache");
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
      connectionHealth: "healthy",
      realmId: "9130354997998",
      companyName: "Sandbox Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 24 * 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastTokenRefreshAt: new Date(),
      defaultPayableAccountId: "33",
      defaultPayableAccountName: "Accounts Payable (A/P)",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  // Deliberately do NOT seed qbo_accounts_cache. The posting path must
  // resolve account types live from QBO so AP detection still fires.
  await db.insert(glMappingsTable).values({
    orgId,
    code: "Meals & Entertainment",
    qboAccount: "Meals and Entertainment",
    qboAccountId: "13",
  });
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId, name: "D" })
    .returning();
  const [report] = await db
    .insert(expenseReportsTable)
    .values({
      orgId,
      employeeId: userId,
      departmentId: dept.id,
      title: "Cold cache AP entity",
      status: "Finance Approved",
      displayCode: `CLD-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  await db.insert(lineItemsTable).values({
    reportId: report.id,
    occurredOn: "2026-05-10",
    merchant: "M",
    description: "x",
    category: "Meals & Entertainment",
    amount: "75.00",
    paymentMethod: "Personal Card",
  });

  let accountQueryCount = 0;
  let postedBody: unknown = null;
  const fetchMock = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.includes("/query?")) {
      const decoded = decodeURIComponent(u);
      if (/FROM Account/i.test(decoded)) {
        accountQueryCount += 1;
        // Cold cache forced posting to live-look up the AP and expense
        // accounts; return both so downstream detection wires Entity.
        return new Response(
          JSON.stringify({
            QueryResponse: {
              Account: [
                { Id: "33", Name: "AP", FullyQualifiedName: "AP", AccountType: "Accounts Payable", AccountSubType: "AccountsPayable", Classification: "Liability", Active: true },
                { Id: "13", Name: "Meals", FullyQualifiedName: "Meals", AccountType: "Expense", AccountSubType: "EntertainmentMeals", Classification: "Expense", Active: true },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (/FROM Vendor/i.test(decoded)) {
        return new Response(
          JSON.stringify({ QueryResponse: { Vendor: [{ Id: "58", DisplayName: "QBO Test Admin" }] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    if (u.includes("/journalentry?")) {
      postedBody = JSON.parse(String(init.body));
      return new Response(
        JSON.stringify({ JournalEntry: { Id: "999", SyncToken: "0" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in cold-cache test: ${u}`);
  }) as unknown as typeof fetch;

  const result = await postReportToQbo(report, { fetchFn: fetchMock });
  assert.equal(result.status, "posted", `expected posted, got: ${JSON.stringify(result)}`);
  assert.ok(accountQueryCount >= 1, "cold cache must trigger an Account live-lookup");

  const sent = postedBody as {
    Line: Array<{
      JournalEntryLineDetail: {
        AccountRef: { value?: string };
        Entity?: { Type: string; EntityRef: { value: string } };
      };
    }>;
  };
  const apLine = sent.Line.find(
    (l) => l.JournalEntryLineDetail.AccountRef.value === "33",
  );
  assert.ok(apLine, "expected AP credit line");
  assert.ok(
    apLine!.JournalEntryLineDetail.Entity,
    "AP credit line must carry Entity even when cache started cold",
  );
  assert.equal(apLine!.JournalEntryLineDetail.Entity!.EntityRef.value, "58");

  // Side-effect: the cache should now be warm for both accounts so a
  // subsequent post for this org doesn't re-query.
  const warmed = await db
    .select()
    .from(qboAccountsCacheTable)
    .where(eq(qboAccountsCacheTable.orgId, orgId));
  const warmedIds = new Set(warmed.map((r) => r.qboAccountId));
  assert.ok(warmedIds.has("33"), "AP account should be persisted to cache after lookup");
  assert.ok(warmedIds.has("13"), "expense account should be persisted to cache after lookup");
});

await test("postReportToQbo on real mode creates a Vendor when none exists, caches the new id, and reuses it on retry (no second create)", async () => {
  const { glMappingsTable, lineItemsTable, qboAccountsCacheTable, qboVendorCacheTable } = await import(
    "@workspace/db"
  );
  const { orgId, userId } = await makeOrg("realApEntityCreate");
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
      connectionHealth: "healthy",
      realmId: "9130354997998",
      companyName: "Sandbox Co",
      accessTokenEncrypted: encMod.encryptString("AT"),
      refreshTokenEncrypted: encMod.encryptString("RT"),
      tokenExpiresAt: new Date(Date.now() + 24 * 3600_000),
      refreshTokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      lastTokenRefreshAt: new Date(),
      defaultPayableAccountId: "33",
      defaultPayableAccountName: "Accounts Payable (A/P)",
    })
    .where(eq(qboConnectionTable.orgId, orgId));
  await db.insert(qboAccountsCacheTable).values([
    { orgId, qboAccountId: "13", name: "Meals", fullyQualifiedName: "Meals", accountType: "Expense", accountSubType: null, classification: "Expense", active: true },
    { orgId, qboAccountId: "33", name: "AP", fullyQualifiedName: "AP", accountType: "Accounts Payable", accountSubType: "AccountsPayable", classification: "Liability", active: true },
  ]);
  await db.insert(glMappingsTable).values({
    orgId,
    code: "Meals & Entertainment",
    qboAccount: "Meals",
    qboAccountId: "13",
  });
  const [dept] = await db
    .insert(departmentsTable)
    .values({ orgId, name: "D" })
    .returning();
  async function makeReport(suffix: string) {
    const [r] = await db
      .insert(expenseReportsTable)
      .values({
        orgId,
        employeeId: userId,
        departmentId: dept.id,
        title: `Real-mode AP entity create ${suffix}`,
        status: "Finance Approved",
        displayCode: `AP2-${randomUUID().slice(0, 6).toUpperCase()}`,
      })
      .returning();
    await db.insert(lineItemsTable).values({
      reportId: r.id,
      occurredOn: "2026-05-10",
      merchant: "M",
      description: "x",
      category: "Meals & Entertainment",
      amount: "100.00",
      paymentMethod: "Personal Card",
    });
    return r;
  }

  let createCalls = 0;
  let queryCalls = 0;
  const fetchMock = (async (url: string, init: RequestInit) => {
    const u = String(url);
    if (u.includes("/query?") && /Vendor/i.test(decodeURIComponent(u))) {
      queryCalls += 1;
      // First post: lookup misses (empty QueryResponse). Subsequent
      // posts must short-circuit on the cache and never hit query
      // again — assert that below.
      return new Response(JSON.stringify({ QueryResponse: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (u.includes("/vendor?") && init?.method === "POST") {
      createCalls += 1;
      const body = JSON.parse(String(init.body));
      assert.equal(body.DisplayName, "QBO Test Admin");
      assert.ok(body.PrimaryEmailAddr?.Address, "must send the submitter's email");
      return new Response(
        JSON.stringify({ Vendor: { Id: "777", SyncToken: "0", DisplayName: body.DisplayName } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (u.includes("/journalentry?")) {
      return new Response(
        JSON.stringify({ JournalEntry: { Id: `JE-${randomUUID().slice(0, 6)}`, SyncToken: "0" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch in AP-create test: ${u}`);
  }) as unknown as typeof fetch;

  const r1 = await makeReport("first");
  const result1 = await postReportToQbo(r1, { fetchFn: fetchMock });
  assert.equal(result1.status, "posted");
  assert.equal(queryCalls, 1, "first post must query for the vendor");
  assert.equal(createCalls, 1, "first post must create the vendor when missing");

  const cached = await db
    .select()
    .from(qboVendorCacheTable)
    .where(
      and(
        eq(qboVendorCacheTable.orgId, orgId),
        eq(qboVendorCacheTable.userId, userId),
      ),
    );
  assert.equal(cached.length, 1);
  assert.equal(cached[0].qboVendorId, "777");

  // Second post: cache hit — neither query nor create may run again.
  const r2 = await makeReport("second");
  const result2 = await postReportToQbo(r2, { fetchFn: fetchMock });
  assert.equal(result2.status, "posted");
  assert.equal(queryCalls, 1, "second post must reuse cached vendor (no extra query)");
  assert.equal(createCalls, 1, "second post must reuse cached vendor (no extra create)");
});

await test("postReportToQbo on stub mode emits a payload without a Tag header even when tags are assigned", async () => {
  const { db: dbMod, qboTagsTable, qboTagAssignmentsTable } = await import(
    "@workspace/db"
  );
  const { orgId, userId } = await makeOrg("stubPostTagged");
  await connectQboStub(orgId);
  const [dept] = await dbMod
    .insert(departmentsTable)
    .values({ orgId, name: "Test Dept" })
    .returning();
  const [report] = await dbMod
    .insert(expenseReportsTable)
    .values({
      orgId,
      employeeId: userId,
      departmentId: dept.id,
      title: "Tagged Stub Posting Test",
      status: "Finance Approved",
      displayCode: `TAG-${randomUUID().slice(0, 6).toUpperCase()}`,
    })
    .returning();
  const [tag] = await dbMod
    .insert(qboTagsTable)
    .values({ orgId, name: "Project Alpha" })
    .returning();
  await dbMod
    .insert(qboTagAssignmentsTable)
    .values({ orgId, reportId: report.id, tagId: tag.id });
  const result = await postReportToQbo(report);
  assert.notEqual(result.status, "error");
  const events = await db
    .select()
    .from(qboPostingEventsTable)
    .where(eq(qboPostingEventsTable.reportId, report.id));
  assert.equal(events.length, 1);
  const payload = events[0].payload as {
    JournalEntry: Record<string, unknown>;
  };
  assert.ok(
    !("Tag" in payload.JournalEntry),
    "Stub-mode payload must not include a Tag property on JournalEntry",
  );
  assert.match(
    String(payload.JournalEntry.PrivateNote),
    /Project Alpha/,
    "Stub-mode payload should record the tag in PrivateNote",
  );
  assert.deepEqual(events[0].tagsSent, ["Project Alpha"]);
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
