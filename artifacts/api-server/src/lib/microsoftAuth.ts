/**
 * Microsoft Entra ID (Azure AD) OIDC client.
 *
 * Wraps the `openid-client` library with our specific configuration for
 * Microsoft's v2.0 endpoints and the redirect URI computed from
 * `PUBLIC_BASE_URL`. The Configuration is discovered lazily on first use
 * and cached for the lifetime of the process.
 *
 * The feature is "enabled" only when MS_CLIENT_ID, MS_CLIENT_SECRET,
 * MS_TENANT_ID, and PUBLIC_BASE_URL are all present at startup. When any
 * are missing, `microsoftAuthEnabled` is false and the routes return a
 * clear error — there is no silent fallback.
 */
import * as client from "openid-client";
import { logger } from "./logger";

export const MICROSOFT_CALLBACK_PATH = "/api/auth/microsoft/callback";

export type MicrosoftAuthConfig = {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  publicBaseUrl: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  issuerUrl: URL;
};

function trimEnv(name: string): string | null {
  const v = process.env[name];
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function loadConfig(): MicrosoftAuthConfig | null {
  const clientId = trimEnv("MS_CLIENT_ID");
  const clientSecret = trimEnv("MS_CLIENT_SECRET");
  const tenantId = trimEnv("MS_TENANT_ID");
  const publicBaseUrl = trimEnv("PUBLIC_BASE_URL");
  if (!clientId || !clientSecret || !tenantId || !publicBaseUrl) return null;

  // Normalize: strip trailing slashes; default to https:// when no scheme is
  // provided. Microsoft requires an absolute https URL on the registered
  // redirect URI, so silently dropping the scheme would produce a broken
  // value like `expense.replit.app/api/auth/...`.
  let base = publicBaseUrl.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(`https://login.microsoftonline.com/${tenantId}/v2.0`);
  } catch {
    return null;
  }
  return {
    clientId,
    clientSecret,
    tenantId,
    publicBaseUrl: base,
    redirectUri: `${base}${MICROSOFT_CALLBACK_PATH}`,
    postLogoutRedirectUri: `${base}/`,
    issuerUrl,
  };
}

const _config = loadConfig();

export const microsoftAuthEnabled: boolean = _config !== null;

export function getMicrosoftAuthConfig(): MicrosoftAuthConfig {
  if (!_config) {
    throw new Error(
      "Microsoft sign-in is not configured. Set MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, and PUBLIC_BASE_URL.",
    );
  }
  return _config;
}

export function logMicrosoftAuthStartup(): void {
  if (!_config) {
    logger.warn(
      "Microsoft sign-in disabled: one or more of MS_CLIENT_ID, MS_CLIENT_SECRET, MS_TENANT_ID, PUBLIC_BASE_URL is missing. The 'Sign in with Microsoft' button will be hidden.",
    );
    return;
  }
  // Compute and print every redirect URI that needs to be registered on the
  // Entra app's "Web" platform: the canonical PUBLIC_BASE_URL one (used in
  // production / on every call) plus the active Replit dev domain when
  // present, since the dev preview lives on a different origin.
  const devDomain = (process.env["REPLIT_DEV_DOMAIN"] ?? "").trim();
  const redirectUris = [_config.redirectUri];
  if (devDomain && !_config.redirectUri.includes(devDomain)) {
    redirectUris.push(`https://${devDomain}${MICROSOFT_CALLBACK_PATH}`);
  }
  logger.info(
    {
      tenantId: _config.tenantId,
      redirectUris,
    },
    "Microsoft sign-in enabled. Register EVERY redirect URI above on the Entra app's Web platform (App registrations → Authentication → Web → Redirect URIs).",
  );
}

let _configurationPromise: Promise<client.Configuration> | null = null;

export async function getOidcConfiguration(): Promise<client.Configuration> {
  const cfg = getMicrosoftAuthConfig();
  if (!_configurationPromise) {
    _configurationPromise = client
      .discovery(cfg.issuerUrl, cfg.clientId, undefined, client.ClientSecretPost(cfg.clientSecret))
      .catch((err) => {
        // Reset so a transient discovery failure doesn't permanently break
        // the feature; the next request can retry.
        _configurationPromise = null;
        throw err;
      });
  }
  return _configurationPromise;
}
