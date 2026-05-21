const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

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

// 401 = токен протух или сессия отозвана. Чтобы не дублировать обработку
// в каждом view, централизованно очищаем localStorage и редиректим
// пользователя на /login. Один раз — повторные 401 не должны спамить.
let didRedirectOn401 = false;

function handleUnauthorized() {
  if (typeof window === "undefined" || didRedirectOn401) return;
  didRedirectOn401 = true;
  try {
    window.localStorage.removeItem("ecoplatform.accessToken");
  } catch {
    /* приватный режим / отсутствие localStorage — игнорируем */
  }
  // Если уже на /login или /register — не редиректим (избегаем цикла).
  if (!/\/(login|register)(\?|$)/.test(window.location.pathname)) {
    window.location.assign("/login");
  }
}

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    credentials: "include",
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message = await response.text();
    throw new ApiError(message || "API request failed", response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiUploadFile(
  file: File,
  options: { token?: string | null; accessLevel?: FileAsset["accessLevel"] } = {},
): Promise<FileAsset> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("accessLevel", options.accessLevel ?? "public");

  const response = await fetch(`${API_URL}/files/upload`, {
    method: "POST",
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    credentials: "include",
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || "File upload failed", response.status);
  }

  return response.json() as Promise<FileAsset>;
}
