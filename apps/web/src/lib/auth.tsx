"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "./api";

type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  company?: {
    organizationName: string;
    status: string;
    demoEndsAt?: string;
    subscriptionPlan?: string;
    subscriptionEndsAt?: string;
  };
  platformRoles: string[];
};

type AuthContextValue = {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem("ecoplatform.accessToken");
    if (saved) {
      setToken(saved);
      void loadMe(saved);
    }
  }, []);

  async function loadMe(nextToken: string) {
    const me = await apiFetch<User>("/auth/me", { token: nextToken });
    setUser(me);
  }

  async function login(email: string, password: string) {
    const result = await apiFetch<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: { email, password, rememberMe: true },
    });
    window.localStorage.setItem("ecoplatform.accessToken", result.accessToken);
    setToken(result.accessToken);
    await loadMe(result.accessToken);
  }

  async function register(input: Record<string, string>) {
    const result = await apiFetch<{ accessToken: string }>("/auth/register", {
      method: "POST",
      body: input,
    });
    window.localStorage.setItem("ecoplatform.accessToken", result.accessToken);
    setToken(result.accessToken);
    await loadMe(result.accessToken);
  }

  async function logout() {
    if (token) {
      await apiFetch("/auth/logout", { method: "POST", token }).catch(() => undefined);
    }
    window.localStorage.removeItem("ecoplatform.accessToken");
    setToken(null);
    setUser(null);
  }

  async function refreshMe() {
    if (token) {
      await loadMe(token);
    }
  }

  const value = useMemo(() => ({ token, user, login, register, logout, refreshMe }), [token, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
