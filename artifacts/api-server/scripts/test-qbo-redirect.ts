/* eslint-disable no-console */
/**
 * Unit tests for resolveQboRedirectUri / QboRedirectConfigError.
 *
 * Run with: pnpm --filter @workspace/api-server run test:qbo-redirect
 *
 * Covers:
 *  - Explicit QBO_OAUTH_REDIRECT_URI override always wins.
 *  - REPLIT_DEV_DOMAIN fallback only fires outside production.
 *  - Production with no override throws QboRedirectConfigError.
 *  - Production with a *.replit.dev override throws (refuses dev host).
 *  - Request-derived fallback only fires outside production.
 *  - isDevDomainRedirect classifies hostnames correctly.
 */
import assert from "node:assert/strict";
import type { Request } from "express";

const ENV_KEYS = [
  "NODE_ENV",
  "QBO_OAUTH_REDIRECT_URI",
  "REPLIT_DEV_DOMAIN",
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const k of ENV_KEYS) savedEnv[k] = process.env[k];

function resetEnv(): void {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  delete process.env["NODE_ENV"];
  delete process.env["QBO_OAUTH_REDIRECT_URI"];
  delete process.env["REPLIT_DEV_DOMAIN"];
}

function makeReq(opts: {
  proto?: string;
  forwardedHost?: string;
  host?: string;
} = {}): Request {
  return {
    protocol: opts.proto ?? "https",
    headers: {
      ...(opts.forwardedHost ? { "x-forwarded-host": opts.forwardedHost } : {}),
    },
    get(name: string): string | undefined {
      if (name.toLowerCase() === "host") return opts.host ?? "localhost:8080";
      return undefined;
    },
  } as unknown as Request;
}

const { resolveQboRedirectUri, QboRedirectConfigError, isDevDomainRedirect } =
  await import("../src/services/qboRedirect.js");

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  resetEnv();
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

console.log("qboRedirect.ts unit tests\n");

await test("explicit override wins (non-production)", () => {
  process.env["NODE_ENV"] = "development";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "https://app.example.com/api/admin/qbo-connection/oauth/callback";
  process.env["REPLIT_DEV_DOMAIN"] = "should-be-ignored.replit.dev";
  const out = resolveQboRedirectUri(makeReq());
  assert.equal(out, "https://app.example.com/api/admin/qbo-connection/oauth/callback");
});

await test("explicit override wins (production)", () => {
  process.env["NODE_ENV"] = "production";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "https://prod.example.com/api/admin/qbo-connection/oauth/callback";
  const out = resolveQboRedirectUri(makeReq());
  assert.equal(out, "https://prod.example.com/api/admin/qbo-connection/oauth/callback");
});

await test("override is trimmed of whitespace", () => {
  process.env["NODE_ENV"] = "production";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "  https://prod.example.com/api/admin/qbo-connection/oauth/callback  ";
  const out = resolveQboRedirectUri(makeReq());
  assert.equal(out, "https://prod.example.com/api/admin/qbo-connection/oauth/callback");
});

await test("dev-domain fallback fires outside production", () => {
  process.env["NODE_ENV"] = "development";
  process.env["REPLIT_DEV_DOMAIN"] = "myrepl-1234.replit.dev";
  const out = resolveQboRedirectUri(makeReq());
  assert.equal(out, "https://myrepl-1234.replit.dev/api/admin/qbo-connection/oauth/callback");
});

await test("dev-domain fallback does NOT fire in production", () => {
  process.env["NODE_ENV"] = "production";
  process.env["REPLIT_DEV_DOMAIN"] = "myrepl-1234.replit.dev";
  assert.throws(
    () => resolveQboRedirectUri(makeReq()),
    (err: unknown) => err instanceof QboRedirectConfigError,
  );
});

await test("production with no override throws QboRedirectConfigError", () => {
  process.env["NODE_ENV"] = "production";
  let caught: unknown = null;
  try {
    resolveQboRedirectUri(makeReq());
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof QboRedirectConfigError);
  assert.equal((caught as QboRedirectConfigError).code, "qbo_redirect_uri_not_configured");
  assert.match((caught as Error).message, /QBO_OAUTH_REDIRECT_URI/);
});

await test("production with *.replit.dev override throws", () => {
  process.env["NODE_ENV"] = "production";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "https://leaked.replit.dev/api/admin/qbo-connection/oauth/callback";
  assert.throws(
    () => resolveQboRedirectUri(makeReq()),
    (err: unknown) => err instanceof QboRedirectConfigError,
  );
});

await test("production with http (non-https) override throws", () => {
  process.env["NODE_ENV"] = "production";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "http://prod.example.com/api/admin/qbo-connection/oauth/callback";
  assert.throws(
    () => resolveQboRedirectUri(makeReq()),
    (err: unknown) => err instanceof QboRedirectConfigError,
  );
});

await test("production with malformed override throws", () => {
  process.env["NODE_ENV"] = "production";
  process.env["QBO_OAUTH_REDIRECT_URI"] = "not-a-url";
  assert.throws(
    () => resolveQboRedirectUri(makeReq()),
    (err: unknown) => err instanceof QboRedirectConfigError,
  );
});

await test("production rejects localhost / loopback / private hosts", () => {
  process.env["NODE_ENV"] = "production";
  for (const host of [
    "https://localhost/api/admin/qbo-connection/oauth/callback",
    "https://my.localhost/api/admin/qbo-connection/oauth/callback",
    "https://127.0.0.1/api/admin/qbo-connection/oauth/callback",
    "https://10.0.0.5/api/admin/qbo-connection/oauth/callback",
    "https://192.168.1.10/api/admin/qbo-connection/oauth/callback",
    "https://172.20.0.5/api/admin/qbo-connection/oauth/callback",
    "https://169.254.0.1/api/admin/qbo-connection/oauth/callback",
    "https://internal-host/api/admin/qbo-connection/oauth/callback",
  ]) {
    process.env["QBO_OAUTH_REDIRECT_URI"] = host;
    assert.throws(
      () => resolveQboRedirectUri(makeReq()),
      (err: unknown) => err instanceof QboRedirectConfigError,
      `expected ${host} to be rejected`,
    );
  }
});

await test("request-derived fallback fires outside production (no dev domain)", () => {
  process.env["NODE_ENV"] = "development";
  const out = resolveQboRedirectUri(
    makeReq({ proto: "https", forwardedHost: "preview.example.dev" }),
  );
  assert.equal(out, "https://preview.example.dev/api/admin/qbo-connection/oauth/callback");
});

await test("request-derived fallback does NOT fire in production", () => {
  process.env["NODE_ENV"] = "production";
  // no override, no dev domain
  assert.throws(
    () =>
      resolveQboRedirectUri(
        makeReq({ proto: "https", forwardedHost: "preview.example.dev" }),
      ),
    (err: unknown) => err instanceof QboRedirectConfigError,
  );
});

await test("isDevDomainRedirect classifies hostnames", () => {
  assert.equal(
    isDevDomainRedirect("https://abcd-1234.replit.dev/api/admin/qbo-connection/oauth/callback"),
    true,
  );
  assert.equal(
    isDevDomainRedirect("https://abcd-1234.REPLIT.DEV/api/admin/qbo-connection/oauth/callback"),
    true,
  );
  assert.equal(
    isDevDomainRedirect("https://my-app.replit.app/api/admin/qbo-connection/oauth/callback"),
    false,
  );
  assert.equal(
    isDevDomainRedirect("https://example.com/api/admin/qbo-connection/oauth/callback"),
    false,
  );
  assert.equal(isDevDomainRedirect("not-a-url"), false);
});

resetEnv();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
