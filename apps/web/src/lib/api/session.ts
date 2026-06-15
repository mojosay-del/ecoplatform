import { API_URL } from "./config";
import { ApiError, extractApiErrorMessage } from "./errors";

type AccessTokenListener = (token: string | null) => void;
export type ApiRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

const accessTokenListeners = new Set<AccessTokenListener>();
let refreshPromise: Promise<string> | null = null;
let currentCsrfToken: string | null = null;

// Access-токен живёт ТОЛЬКО в памяти модуля — никогда не пишется в localStorage.
// Это закрывает классическую stored-XSS-атаку «утянули token из localStorage».
// При перезагрузке страницы токен восстанавливается через `/auth/refresh` по
// HttpOnly refresh-cookie (см. AuthProvider).
let currentAccessToken: string | null = null;

export function getAccessToken() {
  return currentAccessToken;
}

export function setAccessToken(token: string) {
  didRedirectOn401 = false;
  currentAccessToken = token;
  accessTokenListeners.forEach((listener) => listener(token));
}

export function clearAccessToken() {
  currentAccessToken = null;
  currentCsrfToken = null;
  accessTokenListeners.forEach((listener) => listener(null));
}

export function subscribeAccessToken(listener: AccessTokenListener) {
  accessTokenListeners.add(listener);
  return () => {
    accessTokenListeners.delete(listener);
  };
}

// 401 = токен протух или сессия отозвана. Чтобы не дублировать обработку
// в каждом view, централизованно очищаем in-memory token и редиректим
// пользователя на /login. Один раз — повторные 401 не должны спамить.
let didRedirectOn401 = false;

export function handleUnauthorized() {
  if (typeof window === "undefined" || didRedirectOn401) return;
  didRedirectOn401 = true;
  clearAccessToken();
  // Если уже на /login или /register — не редиректим (избегаем цикла).
  if (!/\/(login|register)(\?|$)/.test(window.location.pathname)) {
    window.location.assign("/login");
  }
}

export function isAuthEntryPath(path: string) {
  return path === "/auth/login" || path === "/auth/register" || path === "/auth/refresh";
}

function requestPath(path: string) {
  return path.split("?")[0];
}

function needsCsrfToken(path: string, method = "GET") {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS") return false;
  const normalizedPath = requestPath(path);
  return normalizedPath !== "/auth/login" && normalizedPath !== "/auth/register";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export async function ensureCsrfToken(): Promise<string> {
  const cookieToken = readCookie(CSRF_COOKIE_NAME);
  if (cookieToken) {
    currentCsrfToken = cookieToken;
    return cookieToken;
  }
  if (currentCsrfToken) {
    return currentCsrfToken;
  }

  const response = await fetch(`${API_URL}/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    const message = extractApiErrorMessage(await response.text());
    throw new ApiError(message || "Не удалось подготовить CSRF-токен.", response.status);
  }

  const result = (await response.json()) as { csrfToken?: string };
  const token = result.csrfToken ?? readCookie(CSRF_COOKIE_NAME);
  if (!token) {
    throw new ApiError("Не удалось подготовить CSRF-токен.", 403);
  }

  currentCsrfToken = token;
  return token;
}

async function csrfHeadersForRequest(path: string, method = "GET"): Promise<Record<string, string>> {
  if (!needsCsrfToken(path, method)) return {};
  return { [CSRF_HEADER_NAME]: await ensureCsrfToken() };
}

export async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: await csrfHeadersForRequest("/auth/refresh", "POST"),
    });

    if (!response.ok) {
      const message = extractApiErrorMessage(await response.text());
      clearAccessToken();
      throw new ApiError(message || "Не удалось обновить сессию.", response.status);
    }

    const result = (await response.json()) as { accessToken: string };
    setAccessToken(result.accessToken);
    return result.accessToken;
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// Восстановление сессии после reload страницы: токен в памяти потерян,
// но HttpOnly refresh-cookie на месте — пробуем поменять его на свежий
// access-token. Возвращает true, если успешно (юзер залогинен).
export async function tryRestoreSession(): Promise<boolean> {
  try {
    await refreshAccessToken();
    return true;
  } catch {
    return false;
  }
}

function withAuthorization(headers: Record<string, string> | undefined, token: string | null) {
  return {
    ...(headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function fetchWithAuthRetry(path: string, init: ApiRequestInit, token?: string | null) {
  const request = async (nextToken: string | null) => {
    const csrfHeaders = await csrfHeadersForRequest(path, init.method);
    return fetch(`${API_URL}${path}`, {
      ...init,
      headers: withAuthorization({ ...init.headers, ...csrfHeaders }, nextToken),
      credentials: "include",
    });
  };

  const currentToken = token ?? getAccessToken();
  let response = await request(currentToken);

  if (response.status === 401 && currentToken && !isAuthEntryPath(path)) {
    try {
      const refreshedToken = await refreshAccessToken();
      response = await request(refreshedToken);
    } catch {
      handleUnauthorized();
    }
  }

  return response;
}
