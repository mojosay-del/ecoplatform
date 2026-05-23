const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const ACCESS_TOKEN_STORAGE_KEY = "ecoplatform.accessToken";

export type ApiOptions = {
  token?: string | null;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export type FileAsset = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  accessLevel: "public" | "authenticated" | "platform_private" | "conversation_private";
  publicUrl: string | null;
  createdAt: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type AccessTokenListener = (token: string | null) => void;
type ApiRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const accessTokenListeners = new Set<AccessTokenListener>();
let refreshPromise: Promise<string> | null = null;

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string) {
  didRedirectOn401 = false;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
    } catch {
      /* приватный режим / отсутствие localStorage — игнорируем */
    }
  }
  accessTokenListeners.forEach((listener) => listener(token));
}

export function clearAccessToken() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    } catch {
      /* приватный режим / отсутствие localStorage — игнорируем */
    }
  }
  accessTokenListeners.forEach((listener) => listener(null));
}

export function subscribeAccessToken(listener: AccessTokenListener) {
  accessTokenListeners.add(listener);
  return () => {
    accessTokenListeners.delete(listener);
  };
}

// 401 = токен протух или сессия отозвана. Чтобы не дублировать обработку
// в каждом view, централизованно очищаем localStorage и редиректим
// пользователя на /login. Один раз — повторные 401 не должны спамить.
let didRedirectOn401 = false;

function handleUnauthorized() {
  if (typeof window === "undefined" || didRedirectOn401) return;
  didRedirectOn401 = true;
  clearAccessToken();
  // Если уже на /login или /register — не редиректим (избегаем цикла).
  if (!/\/(login|register)(\?|$)/.test(window.location.pathname)) {
    window.location.assign("/login");
  }
}

function isAuthEntryPath(path: string) {
  return path === "/auth/login" || path === "/auth/register" || path === "/auth/refresh";
}

async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });

    if (!response.ok) {
      const message = await response.text();
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

function withAuthorization(headers: Record<string, string> | undefined, token: string | null) {
  return {
    ...(headers ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchWithAuthRetry(path: string, init: ApiRequestInit, token?: string | null) {
  const request = (nextToken: string | null) =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers: withAuthorization(init.headers, nextToken),
      credentials: "include",
    });

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

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetchWithAuthRetry(path, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  }, options.token);

  if (!response.ok) {
    if (response.status === 401 && !isAuthEntryPath(path)) {
      handleUnauthorized();
    }
    const message = await response.text();
    throw new ApiError(message || "API request failed", response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiUploadFile(
  file: File,
  options: { token?: string | null; accessLevel?: FileAsset["accessLevel"]; imagePreset?: "cover" } = {},
): Promise<FileAsset> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("accessLevel", options.accessLevel ?? "public");
  if (options.imagePreset) {
    formData.append("imagePreset", options.imagePreset);
  }

  const response = await fetchWithAuthRetry("/files/upload", {
    method: "POST",
    body: formData,
  }, options.token);

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message = await response.text();
    throw new ApiError(message || "File upload failed", response.status);
  }

  return response.json() as Promise<FileAsset>;
}

export async function apiDeleteFile(
  fileId: string,
  options: { token?: string | null } = {},
): Promise<{ ok: boolean }> {
  const response = await fetchWithAuthRetry(`/files/${encodeURIComponent(fileId)}`, {
    method: "DELETE",
  }, options.token);

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message = await response.text();
    throw new ApiError(message || "File delete failed", response.status);
  }

  return response.json() as Promise<{ ok: boolean }>;
}
