import type { NextFunction, Request, Response } from "express";
import {
  BEARER_PREFIX,
  CLIENT_HEADER,
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  lookupSession,
  safeEqual,
  type SessionLookup,
} from "../lib/auth";
import { sendProblem } from "../lib/problem";

const COOKIE_BASE = {
  httpOnly: true as const,
  secure: true as const,
  sameSite: "lax" as const,
  path: "/",
};

const NEW_SESSION_TOKEN_HEADER = "X-New-Session-Token";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: SessionLookup;
      isIosClient?: boolean;
    }
  }
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getRawToken(req: Request): string | null {
  // iOS clients send the session token as a bearer header.
  const header = req.headers["authorization"];
  if (typeof header === "string" && header.startsWith(BEARER_PREFIX)) {
    return header.slice(BEARER_PREFIX.length).trim() || null;
  }
  // Web clients use the HTTP-only session cookie.
  const cookieToken = (req as Request & { cookies?: Record<string, string> })
    .cookies?.[SESSION_COOKIE];
  return cookieToken ?? null;
}

export async function attachSession(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  req.isIosClient = req.headers[CLIENT_HEADER] === "ios";
  const token = getRawToken(req);
  if (!token) {
    next();
    return;
  }
  const session = await lookupSession(token);
  if (session) {
    req.auth = session;
    if (session.rotated) {
      if (req.isIosClient) {
        // Mobile/iOS clients (Bearer auth) read the rotated secret out of the
        // X-New-Session-Token response header on every request.
        res.setHeader(NEW_SESSION_TOKEN_HEADER, session.rotated.rawToken);
      } else {
        // Web clients pick up the rotated secret via the HttpOnly Set-Cookie.
        // We deliberately do NOT echo the secret in a JS-readable response
        // header here — that would defeat the HttpOnly protection.
        res.cookie(SESSION_COOKIE, session.rotated.rawToken, {
          ...COOKIE_BASE,
          expires: session.rotated.expiresAt,
        });
      }
    }
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    sendProblem(res, 401, "Unauthorized", "Sign in required.");
    return;
  }
  next();
}

export function requireRole(
  ...roles: ReadonlyArray<string>
): (req: Request, res: Response, next: NextFunction) => void {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.auth) {
      sendProblem(res, 401, "Unauthorized", "Sign in required.");
      return;
    }
    if (!allowed.has(req.auth.user.role)) {
      sendProblem(
        res,
        403,
        "Forbidden",
        `Requires one of: ${[...allowed].join(", ")}`,
      );
      return;
    }
    next();
  };
}

// CSRF for browser sessions only. Mobile clients send a non-cookie bearer
// token, which is itself not vulnerable to CSRF.
export function csrfGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!MUTATING_METHODS.has(req.method)) {
    next();
    return;
  }
  if (!req.auth) {
    next();
    return;
  }
  if (req.isIosClient) {
    next();
    return;
  }
  const cookieValue = (
    req as Request & { cookies?: Record<string, string> }
  ).cookies?.[CSRF_COOKIE];
  const headerValue = req.header(CSRF_HEADER);
  if (
    !cookieValue ||
    !headerValue ||
    cookieValue !== req.auth.session.csrfToken ||
    !safeEqual(cookieValue, headerValue)
  ) {
    sendProblem(
      res,
      403,
      "CSRF Failed",
      "Missing or invalid CSRF token. Web clients must send the X-CSRF-Token header matching the cookie.",
    );
    return;
  }
  next();
}
