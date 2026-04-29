import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, eq, gte } from "drizzle-orm";
import {
  BootstrapAdminBody,
  GetBootstrapStatusResponse,
  LoginResponse as AuthSessionResponse,
  LoginBody,
} from "@workspace/api-zod";
import {
  db,
  loginAttemptsTable,
  orgsTable,
  sessionsTable,
  usersTable,
} from "../lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  hashToken,
  verifyPassword,
  CSRF_COOKIE,
  SESSION_COOKIE,
} from "../lib/auth";
import { sendProblem } from "../lib/problem";
import { requireAuth } from "../middlewares/session";
import { toUserDto } from "../lib/serializers";
import { departmentsTable } from "@workspace/db";

const router: IRouter = Router();

const COOKIE_BASE = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "lax" as const,
  path: "/",
};

function setSessionCookies(
  res: Response,
  sessionToken: string,
  csrfToken: string,
  expiresAt: Date,
): void {
  res.cookie(SESSION_COOKIE, sessionToken, { ...COOKIE_BASE, expires: expiresAt });
  // CSRF cookie is readable by JS so the SPA can echo it in X-CSRF-Token.
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...COOKIE_BASE,
    httpOnly: false,
    expires: expiresAt,
  });
}

function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, COOKIE_BASE);
  res.clearCookie(CSRF_COOKIE, { ...COOKIE_BASE, httpOnly: false });
}

async function loadAuthBundle(userId: string) {
  const rows = await db
    .select()
    .from(usersTable)
    .leftJoin(
      departmentsTable,
      eq(usersTable.departmentId, departmentsTable.id),
    )
    .where(eq(usersTable.id, userId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("User not found after auth");
  return { user: row.users, department: row.departments };
}

router.get("/auth/bootstrap-status", async (_req, res): Promise<void> => {
  const [{ value }] = await db
    .select({ value: count() })
    .from(usersTable);
  res.json(
    GetBootstrapStatusResponse.parse({ bootstrapped: Number(value) > 0 }),
  );
});

router.post("/auth/bootstrap", async (req, res): Promise<void> => {
  const parsed = BootstrapAdminBody.safeParse(req.body);
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const [{ value }] = await db.select({ value: count() }).from(usersTable);
  if (Number(value) > 0) {
    sendProblem(
      res,
      409,
      "Bootstrap Complete",
      "An admin already exists; use the invite flow.",
    );
    return;
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const result = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(orgsTable)
      .values({ name: parsed.data.orgName })
      .returning();
    const [user] = await tx
      .insert(usersTable)
      .values({
        orgId: org.id,
        email: parsed.data.email.toLowerCase(),
        passwordHash,
        fullName: parsed.data.fullName,
        role: "System Admin",
        isAlsoEmployee: true,
      })
      .returning();
    return { user };
  });

  const { rawToken, csrfToken, session } = await createSession(
    result.user.id,
    req.ip ?? null,
    req.get("user-agent") ?? null,
  );

  if (!req.isIosClient) {
    setSessionCookies(res, rawToken, csrfToken, session.expiresAt);
  }

  const { user, department } = await loadAuthBundle(result.user.id);
  res.status(201).json(
    AuthSessionResponse.parse({
      user: toUserDto(user, department, null),
      csrfToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
      sessionToken: req.isIosClient ? rawToken : null,
    }),
  );
});

const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_FAIL_LIMIT = 8;

async function recentFailures(email: string, ip: string): Promise<number> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  const [{ value }] = await db
    .select({ value: count() })
    .from(loginAttemptsTable)
    .where(
      and(
        eq(loginAttemptsTable.email, email),
        eq(loginAttemptsTable.ip, ip),
        eq(loginAttemptsTable.success, "false"),
        gte(loginAttemptsTable.createdAt, since),
      ),
    );
  return Number(value);
}

async function recordAttempt(
  email: string,
  ip: string,
  success: boolean,
): Promise<void> {
  await db.insert(loginAttemptsTable).values({
    email,
    ip,
    success: success ? "true" : "false",
  });
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    sendProblem(res, 400, "Invalid Body", parsed.error.message);
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const ip = req.ip ?? "unknown";

  if ((await recentFailures(email, ip)) >= LOGIN_FAIL_LIMIT) {
    sendProblem(
      res,
      429,
      "Too Many Attempts",
      "Too many failed sign-in attempts; try again in 15 minutes.",
    );
    return;
  }

  // Email is unique per (orgId, email). For v1 we enforce a single-tenant
  // server, so we resolve the user by email and reject if more than one org
  // happens to share the same address — preventing cross-tenant ambiguity.
  const rows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(2);
  if (rows.length > 1) {
    await recordAttempt(email, ip, false);
    sendProblem(
      res,
      401,
      "Invalid Credentials",
      "Email is registered under multiple organizations; specify org context.",
    );
    return;
  }
  const user = rows[0];

  if (!user || !user.isActive) {
    await recordAttempt(email, ip, false);
    sendProblem(res, 401, "Invalid Credentials");
    return;
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) {
    await recordAttempt(email, ip, false);
    sendProblem(res, 401, "Invalid Credentials");
    return;
  }
  await recordAttempt(email, ip, true);

  const { rawToken, csrfToken, session } = await createSession(
    user.id,
    ip,
    req.get("user-agent") ?? null,
  );
  if (!req.isIosClient) {
    setSessionCookies(res, rawToken, csrfToken, session.expiresAt);
  }
  const { user: loaded, department } = await loadAuthBundle(user.id);
  res.json(
    AuthSessionResponse.parse({
      user: toUserDto(loaded, department, null),
      csrfToken,
      sessionExpiresAt: session.expiresAt.toISOString(),
      sessionToken: req.isIosClient ? rawToken : null,
    }),
  );
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  if (req.auth) {
    await db
      .delete(sessionsTable)
      .where(eq(sessionsTable.id, req.auth.session.id));
  }
  if (!req.isIosClient) {
    clearSessionCookies(res);
  }
  res.status(204).end();
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { user, department } = await loadAuthBundle(req.auth!.user.id);
  res.json(
    AuthSessionResponse.parse({
      user: toUserDto(user, department, null),
      csrfToken: req.auth!.session.csrfToken,
      sessionExpiresAt: req.auth!.session.expiresAt.toISOString(),
      sessionToken: null,
    }),
  );
});

// Helper used by tests/seed scripts to mint a session for a user. Not exposed
// over HTTP.
export async function _mintSessionForUser(userId: string): Promise<string> {
  const { rawToken } = await createSession(userId, null, "smoke-test");
  // Touch helpers so isolated-module tooling sees them as referenced; they
  // remain exported for use by future test plumbing.
  void hashToken;
  void destroySession;
  return rawToken;
}

export default router;
