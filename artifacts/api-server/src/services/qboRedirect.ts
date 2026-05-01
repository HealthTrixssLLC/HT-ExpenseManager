/**
 * Resolves the OAuth redirect URI used for the Intuit handshake.
 *
 * Resolution order:
 *   1. `QBO_OAUTH_REDIRECT_URI` env var (explicit override; required for
 *      production deployments because Intuit pins redirect URIs).
 *   2. `${REPLIT_DEV_DOMAIN}/api/admin/qbo-connection/oauth/callback` —
 *      derived automatically in the Replit dev environment so the demo
 *      OAuth flow Just Works.
 *   3. The current request's origin (final fallback).
 *
 * Note: the redirect URI returned here MUST match the one registered on
 * the Intuit developer dashboard for the Client ID being used.
 */
import type { Request } from "express";

const CALLBACK_PATH = "/api/admin/qbo-connection/oauth/callback";

export function resolveQboRedirectUri(req: Request): string {
  const explicit = process.env["QBO_OAUTH_REDIRECT_URI"];
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain && devDomain.trim().length > 0) {
    return `https://${devDomain}${CALLBACK_PATH}`;
  }
  // Last-ditch fallback derived from the request itself.
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) ?? req.get("host");
  return `${proto}://${host}${CALLBACK_PATH}`;
}
