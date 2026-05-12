/**
 * `AuthContext` value + consumer hooks.
 *
 * Kept separate from `auth.tsx` so this module exports only React values
 * (no components), which lets Vite Fast Refresh hot-update the provider
 * cleanly.
 *
 * Hooks
 * - `useAuth()` — full context, including loading/anonymous/authenticated
 *   status. Use anywhere under `<AuthProvider>`.
 * - `useAuthedUser()` — strict variant for screens already gated by an
 *   `AppShell` route guard; throws if called when anonymous.
 */
import { createContext, useContext } from "react";
import type {
  AuthSession,
  BootstrapBody,
  LoginBody,
  User,
} from "@workspace/api-client-react";
import type { Role } from "./types";

export interface AuthCtx {
  status: "loading" | "anonymous" | "authenticated";
  user: User | null;
  roles: Role[];
  session: AuthSession | null;
  login: (body: LoginBody) => Promise<AuthSession>;
  logout: () => Promise<void>;
  bootstrap: (body: BootstrapBody) => Promise<AuthSession>;
  refresh: () => Promise<void>;
  loginPending: boolean;
  bootstrapPending: boolean;
  /**
   * Whether the API server has Microsoft Entra SSO configured. When false,
   * the LoginPage hides the "Sign in with Microsoft" button.
   */
  microsoftAuthEnabled: boolean;
}

export const AuthContext = createContext<AuthCtx | null>(null);

export function useAuth(): AuthCtx {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth must be used within an <AuthProvider>");
  return v;
}

/** Strict variant — throws if the user is not signed in. Useful inside
 *  protected screens where the AppShell already gated the route. */
export function useAuthedUser(): { user: User; roles: Role[]; csrfToken: string } {
  const { user, roles, session } = useAuth();
  if (!user || roles.length === 0 || !session) {
    throw new Error("useAuthedUser called without an authenticated session");
  }
  return { user, roles, csrfToken: session.csrfToken };
}
