/**
 * Resolves the OAuth redirect URI used for the Intuit handshake.
 *
 * Intuit checks `redirect_uri` byte-for-byte against the URIs registered on
 * the developer dashboard for the Client ID being used (separately per
 * Sandbox / Production). Any drift — extra slash, different host header,
 * stale dev-domain — produces a generic
 *   "The redirect_uri query parameter value is invalid"
 * error from Intuit at authorize time. To keep production deterministic we:
 *
 *   1. In production (`NODE_ENV === "production"`), require an explicit
 *      `QBO_OAUTH_REDIRECT_URI` env var. If it isn't set or doesn't look
 *      like an https URL on a stable public host, throw
 *      `QboRedirectConfigError` so callers can surface an actionable
 *      message instead of silently sending a wrong URI to Intuit.
 *   2. Outside production we still honor `QBO_OAUTH_REDIRECT_URI` first
 *      (so deploy-like setups can pin it), then fall back to
 *      `${REPLIT_DEV_DOMAIN}` (the demo dev environment), then to the
 *      request's `x-forwarded-host` / `host` header.
 *
 * The same resolver is used at OAuth start AND at the OAuth callback, so
 * the `redirect_uri` we pass to Intuit's authorize URL matches the one we
 * pass to the token-exchange — Intuit requires them to match.
 */
import type { Request } from "express";

const CALLBACK_PATH = "/api/admin/qbo-connection/oauth/callback";

/**
 * Thrown when the deployment is missing a usable `QBO_OAUTH_REDIRECT_URI`.
 * Carries an admin-facing message that explains exactly which env var to
 * set and what value to set it to.
 */
export class QboRedirectConfigError extends Error {
  readonly code = "qbo_redirect_uri_not_configured";
  constructor(message: string) {
    super(message);
    this.name = "QboRedirectConfigError";
  }
}

function isProduction(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Returns true when the URI looks like one we are willing to send to
 * Intuit's Production keys tab: an https URL with a non-empty host that
 * is NOT a Replit dev sub-domain.
 */
function looksLikeProductionRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== "https:") return false;
    if (!u.host) return false;
    const host = u.hostname.toLowerCase();
    if (/\.replit\.dev$/.test(host)) return false;
    // Reject localhost / loopback / private / link-local hosts — Intuit
    // cannot reach them, so they cannot be the production redirect URI.
    if (host === "localhost" || host.endsWith(".localhost")) return false;
    if (host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return false;
    if (/^10\./.test(host)) return false;
    if (/^192\.168\./.test(host)) return false;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return false;
    if (/^169\.254\./.test(host)) return false;
    // Require at least one dot in the hostname (i.e. a real public FQDN).
    if (!host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export function resolveQboRedirectUri(req: Request): string {
  const explicit = process.env["QBO_OAUTH_REDIRECT_URI"];
  if (explicit && explicit.trim().length > 0) {
    const trimmed = explicit.trim();
    if (isProduction() && !looksLikeProductionRedirect(trimmed)) {
      throw new QboRedirectConfigError(
        `QBO_OAUTH_REDIRECT_URI is set to "${trimmed}" but does not look like ` +
          `a valid production redirect (must be https on a stable public host, ` +
          `not a *.replit.dev domain). Set it to the exact URL registered on ` +
          `your Intuit app's Production keys tab, e.g. ` +
          `"https://your-app.replit.app${CALLBACK_PATH}".`,
      );
    }
    return trimmed;
  }

  if (isProduction()) {
    throw new QboRedirectConfigError(
      "QBO_OAUTH_REDIRECT_URI is not set on this production deployment. " +
        "Set it to the exact URL registered on your Intuit app's Production " +
        `keys tab (e.g. "https://your-app.replit.app${CALLBACK_PATH}"), then ` +
        "redeploy and try again. Intuit rejects any redirect_uri that does " +
        "not match the registered value byte-for-byte.",
    );
  }

  // Non-production fallbacks. The dev-domain branch only fires outside
  // production so a misconfigured prod deploy can never silently leak a
  // *.replit.dev host into the authorize URL.
  const devDomain = process.env["REPLIT_DEV_DOMAIN"];
  if (devDomain && devDomain.trim().length > 0) {
    return `https://${devDomain}${CALLBACK_PATH}`;
  }
  const proto = (req.headers["x-forwarded-proto"] as string) ?? req.protocol;
  const host = (req.headers["x-forwarded-host"] as string) ?? req.get("host");
  return `${proto}://${host}${CALLBACK_PATH}`;
}

/**
 * Returns true when the host portion of `uri` looks like a Replit dev
 * sub-domain (`*.replit.dev`). Used by the preflight to flag an env-vs-URI
 * mismatch (e.g. production env configured with a sandbox-looking URI).
 */
export function isDevDomainRedirect(uri: string): boolean {
  try {
    const u = new URL(uri);
    return /\.replit\.dev$/i.test(u.hostname);
  } catch {
    return false;
  }
}
