/* eslint-disable no-console */
/**
 * Integration test for POST /admin/qbo-connection/oauth/start.
 *
 * Run with: pnpm --filter @workspace/api-server run test:qbo-oauth-start
 *
 * Mounts the admin router on a tiny express app with a stubbed auth
 * middleware, then asserts that — when the deployment is in production
 * mode without QBO_OAUTH_REDIRECT_URI — the endpoint responds with a
 * 400 problem+json carrying the actionable "qbo_redirect_uri_not_configured"
 * code instead of silently sending a wrong redirect to Intuit.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AddressInfo } from "node:net";

if (!process.env["DATABASE_URL"]) {
  console.error("SKIP: DATABASE_URL not set; oauth-start suite needs a DB.");
  process.exit(0);
}

process.env["QBO_CREDENTIAL_ENCRYPTION_KEY"] ??=
  "test-key-for-qbo-oauth-start-suite-please-replace-in-prod";

const originalNodeEnv = process.env["NODE_ENV"];
const originalRedirectUri = process.env["QBO_OAUTH_REDIRECT_URI"];

const expressMod = await import("express");
const express = expressMod.default;

const { db, pool, orgsTable, usersTable, qboConnectionTable, auditEntriesTable } =
  await import("@workspace/db");
const { eq } = await import("drizzle-orm");

// Stub the session middleware on the admin router by attaching a fake
// req.auth before the real router runs. We import the router AFTER
// setting up the stub so the route guards see our fake user.
const adminRouterMod = await import("../src/routes/admin.js");
const adminRouter = adminRouterMod.default;

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

async function makeAdminOrg(): Promise<{ orgId: string; userId: string }> {
  const [org] = await db
    .insert(orgsTable)
    .values({ name: `__test_oauth_start_${randomUUID().slice(0, 8)}` })
    .returning();
  createdOrgIds.push(org.id);
  const [user] = await db
    .insert(usersTable)
    .values({
      orgId: org.id,
      email: `oauth-start-${randomUUID().slice(0, 8)}@example.com`,
      passwordHash: "x",
      fullName: "OAuth Start Test Admin",
      roles: ["System Admin"],
      isActive: true,
    })
    .returning();
  return { orgId: org.id, userId: user.id };
}

function startApp(auth: { orgId: string; userId: string }): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { auth: unknown }).auth = {
      user: {
        id: auth.userId,
        orgId: auth.orgId,
        roles: ["System Admin"],
      },
    };
    next();
  });
  app.use(adminRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise<void>((res) =>
            server.close(() => res()),
          ),
      });
    });
  });
}

console.log("/admin/qbo-connection/oauth/start integration tests\n");

await test(
  "production without QBO_OAUTH_REDIRECT_URI returns 400 problem+json",
  async () => {
    process.env["NODE_ENV"] = "production";
    delete process.env["QBO_OAUTH_REDIRECT_URI"];
    const { orgId, userId } = await makeAdminOrg();
    // Save credentials so the only failure mode is the missing redirect URI.
    const { saveQboCredentials } = await import("../src/services/qbo.js");
    await saveQboCredentials({
      orgId,
      clientId: "TEST-CLIENT",
      clientSecret: "TEST-SECRET",
      environment: "production",
    });
    const app = await startApp({ orgId, userId });
    try {
      const res = await fetch(`${app.url}/admin/qbo-connection/oauth/start`, {
        method: "POST",
      });
      assert.equal(res.status, 400);
      assert.equal(
        res.headers.get("content-type")?.split(";")[0],
        "application/problem+json",
      );
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body["status"], 400);
      assert.equal(body["code"], "qbo_redirect_uri_not_configured");
      assert.match(body["title"] as string, /Redirect URI/i);
      assert.match(body["detail"] as string, /QBO_OAUTH_REDIRECT_URI/);
    } finally {
      await app.close();
    }
  },
);

await test(
  "production with valid QBO_OAUTH_REDIRECT_URI returns an authorize URL",
  async () => {
    process.env["NODE_ENV"] = "production";
    process.env["QBO_OAUTH_REDIRECT_URI"] =
      "https://prod.example.com/api/admin/qbo-connection/oauth/callback";
    const { orgId, userId } = await makeAdminOrg();
    const { saveQboCredentials } = await import("../src/services/qbo.js");
    await saveQboCredentials({
      orgId,
      clientId: "TEST-CLIENT-2",
      clientSecret: "TEST-SECRET-2",
      environment: "production",
    });
    const app = await startApp({ orgId, userId });
    try {
      const res = await fetch(`${app.url}/admin/qbo-connection/oauth/start`, {
        method: "POST",
      });
      assert.equal(res.status, 200);
      const body = (await res.json()) as { url?: string };
      assert.ok(typeof body.url === "string", "expected an authorize URL");
      const authorize = new URL(body.url!);
      assert.equal(
        authorize.searchParams.get("redirect_uri"),
        "https://prod.example.com/api/admin/qbo-connection/oauth/callback",
      );
      assert.equal(authorize.searchParams.get("client_id"), "TEST-CLIENT-2");
    } finally {
      await app.close();
    }
  },
);

// Best-effort cleanup.
console.log("\nCleaning up…");
for (const id of createdOrgIds) {
  try {
    await db.delete(auditEntriesTable).where(eq(auditEntriesTable.orgId, id));
    await db.delete(qboConnectionTable).where(eq(qboConnectionTable.orgId, id));
    await db.delete(usersTable).where(eq(usersTable.orgId, id));
    await db.delete(orgsTable).where(eq(orgsTable.id, id));
  } catch (err) {
    console.warn(`  ! failed to cleanup org ${id}:`, err);
  }
}

if (originalNodeEnv === undefined) delete process.env["NODE_ENV"];
else process.env["NODE_ENV"] = originalNodeEnv;
if (originalRedirectUri === undefined) delete process.env["QBO_OAUTH_REDIRECT_URI"];
else process.env["QBO_OAUTH_REDIRECT_URI"] = originalRedirectUri;

await pool.end();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
