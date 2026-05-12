/**
 * AuthProvider — owns the React Query state for the current session and
 * exposes login/logout/bootstrap actions through `AuthContext`.
 *
 * Why is the context split across two files?
 *   `auth-context.ts` exports only the `AuthContext` value + the
 *   `useAuth` / `useAuthedUser` hooks. This file (`auth.tsx`) exports only
 *   the provider component. Vite's React Fast Refresh requires a module to
 *   export *only* components (or only hooks/values) to safely hot-reload —
 *   mixing them caused full-page reloads on edit and a runtime
 *   "useAuth must be used within AuthProvider" warning during refresh.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  useLogin,
  useLogout,
  useBootstrapAdmin,
  useGetAuthConfig,
  getGetMeQueryKey,
  getGetAuthConfigQueryKey,
  type AuthSession,
  ApiError,
} from "@workspace/api-client-react";
import { setCsrfToken } from "./api";
import type { Role } from "./types";
import { AuthContext, type AuthCtx } from "./auth-context";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const meQuery = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      retry: false,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
      // Treat 401 as a valid "anonymous" state, not an error to bubble.
      throwOnError: false,
      staleTime: 60_000,
    },
  });
  const loginMut = useLogin();
  const logoutMut = useLogout();
  const bootstrapMut = useBootstrapAdmin();
  const authConfigQuery = useGetAuthConfig({
    query: {
      queryKey: getGetAuthConfigQueryKey(),
      // Microsoft enabled-ness is derived from server env vars and cannot
      // change at runtime — fetch once and cache for the SPA's lifetime.
      staleTime: Infinity,
      retry: false,
    },
  });
  const microsoftAuthEnabled = authConfigQuery.data?.microsoftAuthEnabled === true;

  // Keep the in-memory CSRF token in sync with whatever the server most
  // recently issued. This handles login, bootstrap, and the refresh that
  // happens automatically via /auth/me.
  useEffect(() => {
    const token = meQuery.data?.csrfToken;
    if (token) setCsrfToken(token);
  }, [meQuery.data?.csrfToken]);

  // 401 means anonymous. Any other failure should surface so the dashboard
  // can show an error banner. We rely on throwOnError:false above and gate
  // on the error shape here.
  const isAnonymousFailure =
    meQuery.isError && meQuery.error instanceof ApiError && meQuery.error.status === 401;

  const status: AuthCtx["status"] = meQuery.isLoading
    ? "loading"
    : meQuery.data
      ? "authenticated"
      : isAnonymousFailure || meQuery.isError
        ? "anonymous"
        : "loading";

  const [pendingSession, setPendingSession] = useState<AuthSession | null>(null);

  const session = pendingSession ?? meQuery.data ?? null;
  const user = session?.user ?? null;
  const roles = useMemo<Role[]>(
    () => ((user?.roles as Role[] | undefined) ?? []),
    [user],
  );

  const login = useCallback<AuthCtx["login"]>(
    async (body) => {
      const result = await loginMut.mutateAsync({ data: body });
      if (result.csrfToken) setCsrfToken(result.csrfToken);
      setPendingSession(result);
      // Force a fresh /auth/me so the rest of the app sees the new identity.
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      return result;
    },
    [loginMut, qc],
  );

  const logout = useCallback<AuthCtx["logout"]>(async () => {
    let microsoftLogoutUrl: string | null = null;
    try {
      const result = await logoutMut.mutateAsync();
      // The server returns `{ microsoftLogoutUrl }` for federated sessions.
      // For password sessions (or older clients) it may return 204 or a body
      // with `microsoftLogoutUrl: null` — both are fine.
      microsoftLogoutUrl =
        (result as { microsoftLogoutUrl?: string | null } | null | undefined)
          ?.microsoftLogoutUrl ?? null;
    } catch {
      // Logging out is best-effort: we always clear local state below.
    }
    setCsrfToken(null);
    setPendingSession(null);
    qc.clear();
    if (microsoftLogoutUrl) {
      // Top-level navigation to Microsoft's end-session endpoint completes
      // the federated sign-out; the IdP then redirects back to our
      // post_logout_redirect_uri (the SPA root).
      window.location.assign(microsoftLogoutUrl);
    }
  }, [logoutMut, qc]);

  const bootstrap = useCallback<AuthCtx["bootstrap"]>(
    async (body) => {
      const result = await bootstrapMut.mutateAsync({ data: body });
      if (result.csrfToken) setCsrfToken(result.csrfToken);
      setPendingSession(result);
      await qc.invalidateQueries({ queryKey: getGetMeQueryKey() });
      return result;
    },
    [bootstrapMut, qc],
  );

  const refresh = useCallback<AuthCtx["refresh"]>(async () => {
    await meQuery.refetch();
  }, [meQuery]);

  const value = useMemo<AuthCtx>(
    () => ({
      status,
      user,
      roles,
      session,
      login,
      logout,
      bootstrap,
      refresh,
      loginPending: loginMut.isPending,
      bootstrapPending: bootstrapMut.isPending,
      microsoftAuthEnabled,
    }),
    [
      status,
      user,
      roles,
      session,
      login,
      logout,
      bootstrap,
      refresh,
      loginMut.isPending,
      bootstrapMut.isPending,
      microsoftAuthEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
