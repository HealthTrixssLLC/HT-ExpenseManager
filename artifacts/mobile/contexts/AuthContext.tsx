import {
  ApiError,
  type AuthSession,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  type User,
} from "@workspace/api-client-react";
import * as SecureStore from "expo-secure-store";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";

const TOKEN_KEY = "ht_session_token";

// SecureStore is iOS/Android only. On web (used for the in-workspace preview)
// we transparently fall back to localStorage so the auth flow stays testable.
const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === "web") {
      try {
        return typeof window !== "undefined"
          ? window.localStorage.getItem(key)
          : null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        /* noop */
      }
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  async del(key: string): Promise<void> {
    if (Platform.OS === "web") {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* noop */
      }
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

let memoryToken: string | null = null;
export function getStoredToken(): string | null {
  return memoryToken;
}

/**
 * Captures rotated session tokens from `X-New-Session-Token` response headers
 * issued by the API server. Updates the in-memory token and persists it.
 * Wired up once in `_layout.tsx` via `setResponseInterceptor`.
 */
export async function handleRotatedToken(response: Response): Promise<void> {
  const next = response.headers.get("x-new-session-token");
  if (!next || next === memoryToken) return;
  memoryToken = next;
  try {
    await secureStorage.set(TOKEN_KEY, next);
  } catch {
    /* persistence failure is non-fatal; in-memory copy still works */
  }
}

type AuthState = {
  user: User | null;
  status: "loading" | "signed-in" | "signed-out";
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<"loading" | "signed-in" | "signed-out">(
    "loading",
  );
  const initialized = useRef(false);

  // Restore on cold start
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        const t = await secureStorage.get(TOKEN_KEY);
        if (!t) {
          setStatus("signed-out");
          return;
        }
        memoryToken = t;
        try {
          const session: AuthSession = await getMe();
          setUser(session.user);
          setStatus("signed-in");
        } catch (err) {
          if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
            memoryToken = null;
            await secureStorage.del(TOKEN_KEY);
          }
          setStatus("signed-out");
        }
      } catch {
        setStatus("signed-out");
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password });
    if (!res.sessionToken) {
      throw new Error("Login response did not include a session token.");
    }
    memoryToken = res.sessionToken;
    await secureStorage.set(TOKEN_KEY, res.sessionToken);
    setUser(res.user);
    setStatus("signed-in");
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } catch {
      // ignore — we are clearing local state regardless
    }
    memoryToken = null;
    await secureStorage.del(TOKEN_KEY);
    setUser(null);
    setStatus("signed-out");
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut }),
    [user, status, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
