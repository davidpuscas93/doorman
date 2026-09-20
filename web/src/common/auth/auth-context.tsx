"use client";

import {
  createContext,
  useCallback,
  useMemo,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL;
const HAS_SESSION_KEY = "has_session";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "organizer" | "buyer";
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function warn(message: string, error: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[auth] ${message}`, error);
  }
}

function rememberSession() {
  try {
    localStorage.setItem(HAS_SESSION_KEY, "1");
  } catch (error) {
    warn("could not write the session hint", error);
  }
}

function forgetSession() {
  try {
    localStorage.removeItem(HAS_SESSION_KEY);
  } catch (error) {
    warn("could not remove the session hint", error);
  }
}

function mayHaveSession() {
  try {
    return localStorage.getItem(HAS_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasRestored = useRef(false);
  const accessTokenRef = useRef<string | null>(null);

  const login = useCallback(
    async (email: string, password: string): Promise<void> => {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error("Invalid email or password");
      }

      const data = (await response.json()) as {
        accessToken: string;
        user: AuthUser;
      };

      setAccessToken(data.accessToken);
      setUser(data.user);
      rememberSession();
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      warn("logout request failed; clearing the session locally", error);
    } finally {
      setAccessToken(null);
      setUser(null);
      forgetSession();
    }
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        setAccessToken(null);
        setUser(null);
        forgetSession();
        return null;
      }

      const data = (await response.json()) as {
        accessToken: string;
        user: AuthUser;
      };

      setAccessToken(data.accessToken);
      setUser(data.user);
      rememberSession();

      return data.accessToken;
    } catch (error) {
      warn('refresh request failed', error);
      return null;
    }
  }, []);

  const authFetch = useCallback(
    async (path: string, init: RequestInit = {}): Promise<Response> => {
      const send = (token: string | null) =>
        fetch(`${API_URL}${path}`, {
          ...init,
          credentials: "include",
          headers: {
            ...init.headers,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

      const response = await send(accessTokenRef.current);

      if (response.status !== 401) {
        return response;
      }

      const newToken = await refreshAccessToken();

      if (!newToken) {
        return response;
      }

      return send(newToken);
    },
    [refreshAccessToken],
  );

  const value = useMemo(
    () => ({ user, accessToken, isLoading, login, logout, authFetch }),
    [user, accessToken, isLoading, login, logout, authFetch],
  );

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    async function restore() {
      try {
        if (!mayHaveSession()) return;
        await refreshAccessToken();
      } finally {
        setIsLoading(false);
      }
    }

    void restore();
  }, [refreshAccessToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
