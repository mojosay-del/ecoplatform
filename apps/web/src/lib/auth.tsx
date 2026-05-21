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
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (input: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // ready=false до первой проверки localStorage — иначе guards увидят token=null
  // в момент монтирования и отправят даже залогиненного пользователя на /login.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("ecoplatform.accessToken");
    if (!saved) {
      setReady(true);
      return;
    }
    setToken(saved);
    loadMe(saved)
      .catch(() => {
        window.localStorage.removeItem("ecoplatform.accessToken");
        setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
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
    // Полный переход на /login: гарантированно сбрасывает любой кешированный
    // состояния React-страницы и не даёт пользователю остаться на защищённом url.
    window.location.assign("/login");
  }

  async function refreshMe() {
    if (token) {
      await loadMe(token).catch(() => {
        window.localStorage.removeItem("ecoplatform.accessToken");
        setToken(null);
        setUser(null);
      });
    }
  }

  const value = useMemo(
    () => ({ token, user, ready, login, register, logout, refreshMe }),
    [token, user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
