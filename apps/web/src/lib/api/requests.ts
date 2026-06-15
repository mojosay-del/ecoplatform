import { ApiError, extractApiErrorMessage } from "./errors";
import { fetchWithAuthRetry, handleUnauthorized, isAuthEntryPath } from "./session";

export type ApiOptions = {
  token?: string | null;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

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
