const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export type ApiOptions = {
  token?: string | null;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export type FileAsset = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  variants: Partial<
    Record<
      "webp" | "avif",
      {
        storageKey: string;
        mimeType: string;
        sizeBytes: number;
        publicUrl: string | null;
      }
    >
  > | null;
  accessLevel: "public" | "authenticated" | "platform_private" | "conversation_private";
  publicUrl: string | null;
  // Ссылка для скачивания: для public совпадает с publicUrl, для приватных —
  // короткоживущая presigned-ссылка (или null, если файл недоступен запросившему).
  downloadUrl?: string | null;
  // Ссылка для inline-воспроизведения медиа (video/audio) в плеере — presigned
  // без attachment-расположения, чтобы играло в Safari/iOS. null для не-медиа.
  streamUrl?: string | null;
  createdAt: string;
};

export function preferredFileAssetImageUrl(asset: FileAsset | null | undefined): string | null {
  return asset?.variants?.avif?.publicUrl ?? asset?.variants?.webp?.publicUrl ?? asset?.publicUrl ?? null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// NestJS отдаёт ошибки JSON-объектом `{ message, error, statusCode }`. Когда
// `message` массив (валидация zod) — склеиваем. Любой не-JSON — возвращаем как есть.
function extractApiErrorMessage(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join("; ");
    if (typeof parsed.message === "string") return parsed.message;
    return raw;
  } catch {
    return raw;
  }
}

type AccessTokenListener = (token: string | null) => void;
type ApiRequestInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "X-CSRF-Token";

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

async function ensureCsrfToken(): Promise<string> {
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

async function refreshAccessToken() {
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

async function fetchWithAuthRetry(path: string, init: ApiRequestInit, token?: string | null) {
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

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetchWithAuthRetry(
    path,
    {
      method: options.method ?? "GET",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      body,
    },
    options.token,
  );

  if (!response.ok) {
    if (response.status === 401 && !isAuthEntryPath(path)) {
      handleUnauthorized();
    }
    const message = extractApiErrorMessage(await response.text());
    throw new ApiError(message || "API request failed", response.status);
  }

  return response.json() as Promise<T>;
}

export async function apiDownload(
  path: string,
  options: ApiOptions = {},
): Promise<{ blob: Blob; filename: string | null }> {
  const response = await fetchWithAuthRetry(
    path,
    {
      method: options.method ?? "GET",
      headers: {
        ...(options.headers ?? {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    options.token,
  );

  if (!response.ok) {
    if (response.status === 401 && !isAuthEntryPath(path)) {
      handleUnauthorized();
    }
    const message = extractApiErrorMessage(await response.text());
    throw new ApiError(message || "Download request failed", response.status);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(response.headers.get("Content-Disposition")),
  };
}

function filenameFromContentDisposition(value: string | null): string | null {
  if (!value) return null;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8?.[1]) return decodeURIComponent(utf8[1].replace(/^"|"$/g, ""));
  const ascii = /filename="?([^";]+)"?/i.exec(value);
  return ascii?.[1] ?? null;
}

// Изображения ужимаем прямо в браузере перед загрузкой. Иначе тяжёлый оригинал
// (фото с телефона на 5–10 МБ) на обычном канале передаётся 30+ секунд,
// соединение обрывается и пользователь видит «Load failed».
// Обложки сервер и так пересжимает до 1200px → гоним их в JPEG. Контентные
// картинки хранятся как есть, поэтому для них только уменьшаем слишком большие
// и СОХРАНЯЕМ формат (PNG-скриншоты/схемы не портим перекодировкой в JPEG).
const CLIENT_RESIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_MAX_DIMENSION = 1600;
const CONTENT_IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 0.85;
const SKIP_RESIZE_BELOW_BYTES = 1_500_000;

async function downscaleImageForUpload(
  file: File,
  options: { maxDimension: number; forceJpeg?: boolean },
): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  if (!CLIENT_RESIZABLE_IMAGE_TYPES.has(file.type)) return file;

  try {
    // imageOrientation: "from-image" применяет EXIF-поворот — иначе после
    // перекодировки в canvas фото с телефона легло бы набок.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const needsResize = longest > options.maxDimension;

    // Уже небольшую и лёгкую картинку не трогаем — без лишней перекодировки.
    if (!needsResize && file.size <= SKIP_RESIZE_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const scale = needsResize ? options.maxDimension / longest : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outputType = options.forceJpeg ? "image/jpeg" : file.type;
    const quality = outputType === "image/png" ? undefined : IMAGE_JPEG_QUALITY;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), outputType, quality),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;

    const extension = outputType === "image/png" ? ".png" : outputType === "image/webp" ? ".webp" : ".jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}${extension}`, { type: outputType });
  } catch {
    // Не удалось обработать (необычный формат и т.п.) — грузим оригинал.
    return file;
  }
}

async function prepareUploadFile(file: File, imagePreset?: "cover"): Promise<File> {
  if (imagePreset === "cover") {
    return downscaleImageForUpload(file, { maxDimension: COVER_MAX_DIMENSION, forceJpeg: true });
  }
  if (file.type.startsWith("image/")) {
    return downscaleImageForUpload(file, { maxDimension: CONTENT_IMAGE_MAX_DIMENSION });
  }
  return file;
}

// Загрузка с прогрессом. fetch() не умеет отдавать upload-progress, поэтому
// здесь XMLHttpRequest. Воспроизводим ту же авторизацию, что и fetchWithAuthRetry:
// Bearer-токен, CSRF-заголовок, cookie (withCredentials) и один ретрай на 401.
export async function apiUploadFileWithProgress(
  file: File,
  options: {
    token?: string | null;
    accessLevel?: FileAsset["accessLevel"];
    imagePreset?: "cover";
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<FileAsset> {
  const prepared = await prepareUploadFile(file, options.imagePreset);

  const send = async (authToken: string | null): Promise<{ status: number; body: string }> => {
    const csrfToken = await ensureCsrfToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let abortHandler: (() => void) | null = null;
      const cleanup = () => {
        if (abortHandler) {
          options.signal?.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
      };
      xhr.open("POST", `${API_URL}/files/upload`);
      xhr.withCredentials = true;
      if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      xhr.setRequestHeader(CSRF_HEADER_NAME, csrfToken);

      if (xhr.upload && options.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
        };
      }
      xhr.onload = () => {
        cleanup();
        resolve({ status: xhr.status, body: xhr.responseText });
      };
      xhr.onerror = () => {
        cleanup();
        reject(new ApiError("Не удалось загрузить файл. Проверьте соединение.", 0));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new ApiError("Загрузка отменена.", 0));
      };

      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          return;
        }
        abortHandler = () => xhr.abort();
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      const formData = new FormData();
      formData.append("file", prepared);
      formData.append("accessLevel", options.accessLevel ?? "public");
      if (options.imagePreset) formData.append("imagePreset", options.imagePreset);
      xhr.send(formData);
    });
  };

  const currentToken = options.token ?? getAccessToken();
  let result = await send(currentToken);

  if (result.status === 401 && currentToken) {
    try {
      const refreshed = await refreshAccessToken();
      result = await send(refreshed);
    } catch {
      handleUnauthorized();
    }
  }

  if (result.status < 200 || result.status >= 300) {
    if (result.status === 401) handleUnauthorized();
    throw new ApiError(extractApiErrorMessage(result.body) || "File upload failed", result.status);
  }

  options.onProgress?.(1);
  return JSON.parse(result.body) as FileAsset;
}

export async function apiDeleteFile(fileId: string, options: { token?: string | null } = {}): Promise<{ ok: boolean }> {
  const response = await fetchWithAuthRetry(
    `/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
    },
    options.token,
  );

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message = extractApiErrorMessage(await response.text());
    throw new ApiError(message || "File delete failed", response.status);
  }

  return response.json() as Promise<{ ok: boolean }>;
}
