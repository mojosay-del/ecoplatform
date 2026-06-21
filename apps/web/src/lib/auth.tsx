"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthMeUser, RegistrationResendDto, RegistrationVerifyDto } from "@ecoplatform/shared";
import {
  apiFetch,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
  subscribeAccessToken,
  tryRestoreSession,
} from "./api";

export type User = AuthMeUser;

type AuthContextValue = {
  token: string | null;
  user: User | null;
  ready: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (input: Record<string, string | string[]>) => Promise<RegistrationStartResult>;
  resendRegistrationCode: (input: RegistrationResendDto) => Promise<RegistrationStartResult>;
  verifyRegistration: (input: RegistrationVerifyDto) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

export type RegistrationStartResult = {
  verificationId: string;
  email: string;
  expiresAt: string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // ready=false до попытки восстановить сессию через HttpOnly refresh-cookie —
  // иначе guards увидят token=null в момент монтирования и отправят даже
  // залогиненного пользователя на /login.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return subscribeAccessToken((nextToken) => {
      setToken(nextToken);
      if (!nextToken) {
        setUser(null);
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const restored = await tryRestoreSession();
      const restoredToken = getAccessToken();

      if (!restored || !restoredToken) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const me = await apiFetch<User>("/auth/me", { token: restoredToken });
        if (!cancelled) {
          setUser(me);
        }
      } catch {
        clearAccessToken();
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const loadMe = useCallback(async (nextToken: string) => {
    const me = await apiFetch<User>("/auth/me", { token: nextToken });
    setUser(me);
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe = true) => {
      const result = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: { email, password, rememberMe },
      });
      setAccessToken(result.accessToken);
      await loadMe(result.accessToken);
    },
    [loadMe],
  );

  const register = useCallback(async (input: Record<string, string | string[]>): Promise<RegistrationStartResult> => {
    return apiFetch<RegistrationStartResult>("/auth/register", {
      method: "POST",
      body: input,
    });
  }, []);

  const resendRegistrationCode = useCallback(async (input: RegistrationResendDto): Promise<RegistrationStartResult> => {
    return apiFetch<RegistrationStartResult>("/auth/register/resend", {
      method: "POST",
      body: input,
    });
  }, []);

  const verifyRegistration = useCallback(
    async (input: RegistrationVerifyDto) => {
      const result = await apiFetch<{ accessToken: string }>("/auth/register/verify", {
        method: "POST",
        body: input,
      });
      setAccessToken(result.accessToken);
      await loadMe(result.accessToken);
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    if (token) {
      await apiFetch("/auth/logout", { method: "POST", token }).catch(() => undefined);
    }
    clearAccessToken();
    // Полный переход на /login: гарантированно сбрасывает любой кешированный
    // состояния React-страницы и не даёт пользователю остаться на защищённом url.
    window.location.assign("/login");
  }, [token]);

  const refreshMe = useCallback(async () => {
    if (token) {
      await loadMe(token).catch(() => {
        clearAccessToken();
      });
    }
  }, [loadMe, token]);

  const value = useMemo(
    () => ({ token, user, ready, login, register, resendRegistrationCode, verifyRegistration, logout, refreshMe }),
    [login, logout, ready, refreshMe, register, resendRegistrationCode, token, user, verifyRegistration],
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
