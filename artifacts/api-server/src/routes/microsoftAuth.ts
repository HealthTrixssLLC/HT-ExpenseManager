/**
 * Microsoft Entra ID (Azure AD) sign-in routes.
 *
 *   GET  /auth/microsoft/start     → 302 to Microsoft authorize endpoint
 *   GET  /auth/microsoft/callback  → exchanges code, issues local session,
 *                                    302s back to the SPA root
 *
 * State, PKCE verifier, and nonce are stashed in a short-lived signed
 * cookie (HMAC-SHA256 over `${json}.${b64sig}` with SESSION_SECRET) so we
 * don't need a server-side oauth-state table for this single-tenant flow.
 *
 * The actual local-session creation reuses `createSession` so the result is
 * indistinguishable from an email/password login — same `ht_session` cookie,
 * same CSRF token, same protected-route gating.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  Router,
  type IRouter,
  type Request,
  type Response,
} from "express";
import * as client from "openid-client";
import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "../lib/db";
import {
  createSession,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "../lib/auth";
import {
  getMicrosoftAuthConfig,
  getOidcConfiguration,
  microsoftAuthEnabled,
} from "../lib/microsoftAuth";
import { logger } from "../lib/logger";
import { sendProblem } from "../lib/problem";

const router: IRouter = Router();

const STATE_COOKIE = "ht_ms_oauth";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * HMAC key for the short-lived oauth-state cookie. Prefer SESSION_SECRET so
 * signing keys survive process restarts mid-login. When it isn't set we
 * fall back to a cryptographically strong per-process key (32 bytes from
 * the OS RNG) — never `Math.random()`. The trade-off is that an
 * in-flight login interrupted by a server restart will fail validation
 * (the user just clicks "Sign in with Microsoft" again), which is the
 * correct fail-closed posture.
 */
const SIGN_SECRET: string =
  (process.env["SESSION_SECRET"] ?? "").trim() ||
  randomBytes(32).toString("base64url");

const STATE_COOKIE_BASE = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "lax" as const,
  path: "/",
};

const SESSION_COOKIE_BASE = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "lax" as const,
  path: "/",
};

type OauthStatePayload = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

function sign(payload: string): string {
  return createHmac("sha256", SIGN_SECRET).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function encodeStateCookie(payload: OauthStatePayload): string {
  const json = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `${json}.${sign(json)}`;
}

function decodeStateCookie(value: string | undefined): OauthStatePayload | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return null;
  const json = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  if (!safeEqual(sig, sign(json))) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(json, "base64url").toString("utf8"),
    ) as OauthStatePayload;
    if (
      typeof parsed?.state !== "string" ||
      typeof parsed?.nonce !== "string" ||
      typeof parsed?.codeVerifier !== "string" ||
      typeof parsed?.expiresAt !== "number"
    ) {
      return null;
    }
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function spaErrorRedirect(res: Response, message: string): void {
  // Land back on the SPA login screen (root) with a query param the SPA can
  // surface as an inline error banner. Using a relative URL keeps us on the
  // same origin even if PUBLIC_BASE_URL drifts.
  const safe = encodeURIComponent(message.slice(0, 240));
  res.redirect(`/?msAuthError=${safe}`);
}

router.get(
  "/auth/microsoft/start",
  async (req: Request, res: Response): Promise<void> => {
    if (!microsoftAuthEnabled) {
      sendProblem(
        res,
        503,
        "Not Configured",
        "Microsoft sign-in is not enabled on this server.",
      );
      return;
    }
    try {
      const cfg = getMicrosoftAuthConfig();
      const config = await getOidcConfiguration();

      const codeVerifier = client.randomPKCECodeVerifier();
      const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
      const state = client.randomState();
      const nonce = client.randomNonce();

      res.cookie(
        STATE_COOKIE,
        encodeStateCookie({
          state,
          nonce,
          codeVerifier,
          expiresAt: Date.now() + STATE_TTL_MS,
        }),
        { ...STATE_COOKIE_BASE, maxAge: STATE_TTL_MS },
      );

      const url = client.buildAuthorizationUrl(config, {
        redirect_uri: cfg.redirectUri,
        scope: "openid profile email offline_access",
        state,
        nonce,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        response_mode: "query",
        prompt: "select_account",
      });
      res.redirect(url.toString());
    } catch (err) {
      req.log.error({ err }, "Microsoft auth start failed");
      sendProblem(
        res,
        500,
        "Auth Start Failed",
        err instanceof Error ? err.message : "Unknown error",
      );
    }
  },
);

router.get(
  "/auth/microsoft/callback",
  async (req: Request, res: Response): Promise<void> => {
    if (!microsoftAuthEnabled) {
      spaErrorRedirect(res, "Microsoft sign-in is not configured.");
      return;
    }

    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const stateValue = decodeStateCookie(cookies?.[STATE_COOKIE]);
    res.clearCookie(STATE_COOKIE, STATE_COOKIE_BASE);
    if (!stateValue) {
      spaErrorRedirect(
        res,
        "Sign-in session expired or was tampered with. Please try again.",
      );
      return;
    }

    try {
      const cfg = getMicrosoftAuthConfig();
      const config = await getOidcConfiguration();

      // Build the callback URL exactly as registered with Entra. Using the
      // env-configured PUBLIC_BASE_URL (rather than reflecting headers)
      // guarantees byte-for-byte match with what was sent at /start.
      const currentUrl = new URL(cfg.redirectUri);
      for (const [k, v] of Object.entries(req.query)) {
        if (typeof v === "string") currentUrl.searchParams.set(k, v);
      }

      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: stateValue.codeVerifier,
        expectedState: stateValue.state,
        expectedNonce: stateValue.nonce,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        spaErrorRedirect(res, "Microsoft did not return an ID token.");
        return;
      }
      const oid =
        typeof (claims as Record<string, unknown>)["oid"] === "string"
          ? ((claims as Record<string, unknown>)["oid"] as string)
          : claims.sub;
      const emailRaw =
        (typeof (claims as Record<string, unknown>)["email"] === "string"
          ? ((claims as Record<string, unknown>)["email"] as string)
          : null) ??
        (typeof (claims as Record<string, unknown>)["preferred_username"] === "string"
          ? ((claims as Record<string, unknown>)["preferred_username"] as string)
          : null);
      const name =
        (typeof (claims as Record<string, unknown>)["name"] === "string"
          ? ((claims as Record<string, unknown>)["name"] as string)
          : null) ?? null;

      if (!emailRaw) {
        spaErrorRedirect(
          res,
          "Microsoft account did not include an email address.",
        );
        return;
      }
      const email = emailRaw.toLowerCase();

      // Match by oid first (stable across email changes), then by email.
      // We deliberately scope the email lookup to a single org context — the
      // existing email-as-tenant-key constraint applies here too: if the
      // same email is registered in more than one org we refuse to guess.
      const byOid = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.microsoftSubject, oid))
        .limit(1);
      let user = byOid[0] ?? null;

      if (!user) {
        const byEmail = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(2);
        if (byEmail.length > 1) {
          spaErrorRedirect(
            res,
            "Email is registered under multiple organizations; cannot sign in via Microsoft.",
          );
          return;
        }
        user = byEmail[0] ?? null;
      }

      if (user) {
        if (!user.isActive) {
          spaErrorRedirect(res, "Account is disabled.");
          return;
        }
        // Refuse the link when the matched user already has a *different*
        // Microsoft subject. This protects against the email-reassignment
        // / alias takeover scenario: alice@corp gets renamed in Entra,
        // bob@corp later inherits her old email address, and an oid-less
        // email lookup would otherwise log Bob in as Alice.
        if (user.microsoftSubject && user.microsoftSubject !== oid) {
          spaErrorRedirect(
            res,
            "This email is already linked to a different Microsoft account. Contact your admin.",
          );
          return;
        }
        // Backfill the federated identity link + name if missing.
        const updates: Partial<typeof usersTable.$inferInsert> = {
          authProvider: "microsoft",
        };
        if (!user.microsoftSubject) updates.microsoftSubject = oid;
        if ((!user.fullName || user.fullName.trim().length === 0) && name) {
          updates.fullName = name;
        }
        const [updated] = await db
          .update(usersTable)
          .set(updates)
          .where(eq(usersTable.id, user.id))
          .returning();
        user = updated ?? user;
      } else {
        // Self-provision a brand-new user with no roles. They cannot do
        // anything in the app until a System Admin grants them a role —
        // same posture as `/auth/register` for manually-invited users.
        // We require an existing org to attach the user to. For this v1 we
        // pick the single org if exactly one exists; otherwise we refuse
        // since we have no signal for which tenant to assign them to.
        const orgs = await db
          .select({ id: sql<string>`id` })
          .from(sql`orgs`)
          .limit(2);
        if (orgs.length !== 1) {
          spaErrorRedirect(
            res,
            orgs.length === 0
              ? "No organization is provisioned yet. Bootstrap the System Admin first."
              : "Multiple organizations exist; Microsoft sign-in for new users is ambiguous in this configuration.",
          );
          return;
        }
        const [created] = await db
          .insert(usersTable)
          .values({
            orgId: orgs[0].id,
            email,
            passwordHash: null,
            fullName: name && name.trim().length > 0 ? name : email,
            roles: [],
            isAlsoEmployee: false,
            isActive: true,
            microsoftSubject: oid,
            authProvider: "microsoft",
          } as typeof usersTable.$inferInsert)
          .returning();
        user = created;
      }

      const { rawToken, csrfToken, session } = await createSession(
        user.id,
        req.ip ?? null,
        req.get("user-agent") ?? null,
        "microsoft",
      );
      res.cookie(SESSION_COOKIE, rawToken, {
        ...SESSION_COOKIE_BASE,
        expires: session.expiresAt,
      });
      res.cookie(CSRF_COOKIE, csrfToken, {
        ...SESSION_COOKIE_BASE,
        httpOnly: false,
        expires: session.expiresAt,
      });

      logger.info(
        { userId: user.id, email: user.email },
        "Microsoft sign-in succeeded",
      );
      res.redirect("/");
    } catch (err) {
      req.log.error({ err }, "Microsoft auth callback failed");
      spaErrorRedirect(
        res,
        err instanceof Error ? err.message : "Microsoft sign-in failed.",
      );
    }
  },
);

export default router;
