/**
 * Authentication primitives.
 *
 * Centralises the password hashing, session-token generation, and session
 * lifecycle helpers used by the auth routes (`routes/auth.ts`) and the
 * `attachSession` middleware (`middlewares/session.ts`).
 *
 * Design notes
 * - Session tokens are opaque base64url secrets; only their SHA-256 hash is
 *   persisted (`sessions.tokenHash`). A leaked database row therefore cannot
 *   be replayed.
 * - Browser clients receive the token via an HttpOnly cookie plus a paired
 *   non-HttpOnly CSRF cookie (double-submit). Mobile clients send the token
 *   in `Authorization: Bearer …` and identify themselves via the
 *   `X-Healthtrix-Client` header so CSRF checks are skipped.
 * - The token rotates at most once per hour (see `ROTATION_THRESHOLD_MS`) but
 *   the session row, owner, and absolute expiry stay the same.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import {
  db,
  sessionsTable,
  usersTable,
  type Session,
  type User,
} from "@workspace/db";

export const SESSION_COOKIE = "ht_session";
export const CSRF_COOKIE = "ht_csrf";
export const CLIENT_HEADER = "x-healthtrix-client";
export const CSRF_HEADER = "x-csrf-token";
export const BEARER_PREFIX = "Bearer ";

const ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ROLLING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours of inactivity
// Rotate the session token (the secret stored in the cookie / Bearer header)
// at most once per hour. The session row, the user binding, and the absolute
// expiry stay the same — only the secret rotates, so a leaked token is short
// lived. Issued via a new Set-Cookie + X-New-Session-Token response header.
const ROTATION_THRESHOLD_MS = 60 * 60 * 1000;

const BCRYPT_ROUNDS = 11;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const buf1 = Buffer.from(a);
  const buf2 = Buffer.from(b);
  if (buf1.length !== buf2.length) return false;
  return timingSafeEqual(buf1, buf2);
}

export type CreatedSession = {
  session: Session;
  rawToken: string;
  csrfToken: string;
};

export async function createSession(
  userId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<CreatedSession> {
  const rawToken = generateToken(32);
  const csrfToken = generateToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TTL_MS);

  const [session] = await db
    .insert(sessionsTable)
    .values({
      userId,
      tokenHash: hashToken(rawToken),
      csrfToken,
      ip,
      userAgent,
      lastUsedAt: now,
      expiresAt,
    })
    .returning();

  return { session, rawToken, csrfToken };
}

export async function destroySession(rawToken: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.tokenHash, hashToken(rawToken)));
}

export type SessionLookup = {
  session: Session;
  user: User;
  /**
   * Populated when the session secret was rotated as part of this lookup. The
   * caller (the session middleware) is responsible for emitting the new token
   * to the client via Set-Cookie and the X-New-Session-Token header.
   */
  rotated: { rawToken: string; expiresAt: Date } | null;
};

export async function lookupSession(
  rawToken: string,
): Promise<SessionLookup | null> {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const rows = await db
    .select()
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(
      and(
        eq(sessionsTable.tokenHash, tokenHash),
        gt(sessionsTable.expiresAt, now),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const inactivityCutoff = new Date(now.getTime() - ROLLING_TTL_MS);
  if (row.sessions.lastUsedAt < inactivityCutoff) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, row.sessions.id));
    return null;
  }

  if (!row.users.isActive) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, row.sessions.id));
    return null;
  }

  // Decide whether to rotate the session secret. We rotate based on the
  // session's createdAt (which doubles as "token issued at" because the
  // tokenHash column is updated atomically with createdAt on rotation).
  const sessionAgeMs = now.getTime() - row.sessions.createdAt.getTime();
  if (sessionAgeMs >= ROTATION_THRESHOLD_MS) {
    const newRawToken = generateToken(32);
    const newHash = hashToken(newRawToken);
    // Compare-and-swap on the OLD tokenHash so concurrent requests with the
    // same session token cannot both rotate. Whichever request wins gets the
    // new secret; the loser falls back to a non-rotating "touch" path so the
    // already-issued new secret remains valid for the winner's response.
    const [rotated] = await db
      .update(sessionsTable)
      .set({
        tokenHash: newHash,
        createdAt: now,
        lastUsedAt: now,
      })
      .where(
        and(
          eq(sessionsTable.id, row.sessions.id),
          eq(sessionsTable.tokenHash, tokenHash),
        ),
      )
      .returning();
    if (rotated) {
      return {
        session: rotated,
        user: row.users,
        rotated: { rawToken: newRawToken, expiresAt: rotated.expiresAt },
      };
    }
    // Lost the rotation race; another request already issued a new secret.
    // Fall through and behave as a normal touch on the (now stale-from-our-
    // perspective) session row.
  }

  // Touch lastUsedAt asynchronously; don't block on the result.
  void db
    .update(sessionsTable)
    .set({ lastUsedAt: now })
    .where(eq(sessionsTable.id, row.sessions.id));

  return { session: row.sessions, user: row.users, rotated: null };
}
