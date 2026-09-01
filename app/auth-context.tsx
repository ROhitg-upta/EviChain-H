"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { ReactNode } from "react";
import { login, register, logout, refreshToken as apiRefreshToken } from "@/lib/api";

export type UserRole =
  | "Administrator"
  | "Investigator"
  | "Auditor"
  | "Custodian";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  initials: string;
};

type AuthContextValue = {
  user: CurrentUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  canEdit: boolean;
  accessToken: string | null;
};

/** Normalise backend ALL_CAPS role to frontend title-case. */
function normaliseRole(raw: string): UserRole {
  const map: Record<string, UserRole> = {
    ADMINISTRATOR: "Administrator",
    INVESTIGATOR:  "Investigator",
    AUDITOR:       "Auditor",
    CUSTODIAN:     "Custodian",
  };
  return map[raw.toUpperCase()] ?? (raw as UserRole);
}

const AUTH_KEY    = "evichain-session-v1";
const TOKEN_KEY   = "evichain-token-v1";
const REFRESH_KEY = "evichain-refresh-v1";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]               = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    async function initAuth() {
      try {
        const storedUser    = window.localStorage.getItem(AUTH_KEY);
        const storedToken   = window.localStorage.getItem(TOKEN_KEY);
        const storedRefresh = window.localStorage.getItem(REFRESH_KEY);

        if (storedUser && storedToken) {
          setUser(JSON.parse(storedUser) as CurrentUser);
          setAccessToken(storedToken);
          if (storedRefresh) setRefreshToken(storedRefresh);
        } else {
          // Attempt silent cookie-based session restoration
          const refreshData = await apiRefreshToken();
          if (refreshData) {
            const nextUser: CurrentUser = {
              id:       refreshData.user.id,
              email:    refreshData.user.email,
              name:     refreshData.user.name,
              role:     normaliseRole(refreshData.user.role),
              initials: refreshData.user.name
                .split(" ")
                .map((part) => part.charAt(0))
                .join("")
                .slice(0, 2)
                .toUpperCase(),
            };
            setUser(nextUser);
            setAccessToken(refreshData.accessToken);
            if (refreshData.refreshToken) setRefreshToken(refreshData.refreshToken);
          }
        }
      } catch {
        window.localStorage.removeItem(AUTH_KEY);
        window.localStorage.removeItem(TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_KEY);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  async function signIn(email: string, password: string) {
    const response = await login(email, password);

    const nextUser: CurrentUser = {
      id:       response.user.id,
      email:    response.user.email,
      name:     response.user.name,
      role:     normaliseRole(response.user.role),
      initials: response.user.name
        .split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };

    window.localStorage.setItem(AUTH_KEY,    JSON.stringify(nextUser));
    window.localStorage.setItem(TOKEN_KEY,   response.accessToken);
    window.localStorage.setItem(REFRESH_KEY, response.refreshToken);

    setUser(nextUser);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
  }

  async function signUp(
    email: string,
    password: string,
    name: string,
    role: UserRole,
  ) {
    const response = await register(email, password, name, role);

    const nextUser: CurrentUser = {
      id:       response.user.id,
      email:    response.user.email,
      name:     response.user.name,
      role:     normaliseRole(response.user.role),
      initials: response.user.name
        .split(" ")
        .map((part) => part.charAt(0))
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    };

    window.localStorage.setItem(AUTH_KEY,    JSON.stringify(nextUser));
    window.localStorage.setItem(TOKEN_KEY,   response.accessToken);
    window.localStorage.setItem(REFRESH_KEY, response.refreshToken);

    setUser(nextUser);
    setAccessToken(response.accessToken);
    setRefreshToken(response.refreshToken);
  }

  async function signOut() {
    await logout(accessToken);
    window.localStorage.removeItem(AUTH_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_KEY);
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn,
      signUp,
      signOut,
      canEdit: user?.role !== "Auditor",
      accessToken,
    }),
    [user, loading, accessToken],
  );


  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}