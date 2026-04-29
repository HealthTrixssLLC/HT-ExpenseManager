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

  // Touch lastUsedAt asynchronously; don't block on the result.
  void db
    .update(sessionsTable)
    .set({ lastUsedAt: now })
    .where(eq(sessionsTable.id, row.sessions.id));

  return { session: row.sessions, user: row.users };
}
