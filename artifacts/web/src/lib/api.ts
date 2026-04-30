import {
  setBaseUrl,
  setRequestInterceptor,
  setDefaultCredentials,
  ApiError,
} from "@workspace/api-client-react";

/**
 * Resolve the API base URL.
 *
 * The API server is its own sibling artifact mounted at `/api` by the
 * workspace proxy. The OpenAPI spec uses `/api` as its server prefix, so the
 * generated client already emits `/api/...` URLs. For same-origin deployment
 * (default) we therefore want NO base URL — the path is already correct.
 *
 * `VITE_API_BASE_URL` overrides for cross-origin/staging deployments
 * (e.g. when running the web app off a CDN against a different API host).
 */
function resolveBaseUrl(): string | null {
  const explicit = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (explicit && explicit.length > 0) return stripTrailing(explicit);
  return null;
}

function stripTrailing(s: string): string {
  return s.replace(/\/+$/, "");
}

let _csrfToken: string | null = null;
let _initialized = false;

export function setCsrfToken(token: string | null): void {
  _csrfToken = token;
}

export function getCsrfToken(): string | null {
  return _csrfToken;
}

/**
 * Read the `ht_csrf` cookie at boot. The backend sets both `ht_session`
 * (HTTP-only) and `ht_csrf` (readable) when the user logs in or when the
 * session is refreshed. We use the cookie value as a bootstrap so the very
 * first call to `/auth/me` carries the right header even before any login
 * mutation has run in this tab.
 */
export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)ht_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * One-time setup: configure the generated React-Query client with the
 * artifact's API base URL, default to same-origin cookies, and attach the
 * CSRF header on every mutation.
 */
export function configureApi(): void {
  if (_initialized) return;
  _initialized = true;

  setBaseUrl(resolveBaseUrl());
  setDefaultCredentials("same-origin");

  // Bootstrap the in-memory CSRF from the cookie so the first `/auth/me`
  // call after a hard refresh works without waiting for a login round-trip.
  if (_csrfToken == null) {
    _csrfToken = readCsrfCookie();
  }

  setRequestInterceptor(({ method, headers }) => {
    if (MUTATION_METHODS.has(method) && _csrfToken && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", _csrfToken);
    }
  });
}

/** Pretty-print an API error for inline form messages and toasts. */
export function describeApiError(err: unknown): {
  title: string;
  detail: string;
  status: number | null;
} {
  if (err instanceof ApiError) {
    const data = err.data as
      | { title?: string; detail?: string; code?: string; message?: string }
      | null;
    const title = data?.title ?? data?.code ?? `HTTP ${err.status}`;
    const detail = data?.detail ?? data?.message ?? err.statusText;
    return { title, detail, status: err.status };
  }
  if (err instanceof Error) {
    return { title: err.name || "Error", detail: err.message, status: null };
  }
  return { title: "Error", detail: String(err), status: null };
}

export { ApiError };
