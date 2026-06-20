import type { ApiErrorResponse } from "@ecoplatform/shared";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Единая точка превращения пойманной ошибки в текст для пользователя. API-слой
// (apiFetch/apiDownload/upload/delete) бросает ApiError с сообщением из контракта
// `{ message, error, statusCode }` (см. extractApiErrorMessage), а сетевые/прочие
// сбои приходят обычным Error. Сводим оба к строке, чтобы обработчики во вью не
// повторяли `e instanceof Error ? e.message : fallback` (единый контракт ошибки).
export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// NestJS отдаёт ошибки JSON-объектом `{ message, error, statusCode }`. Когда
// `message` массив (валидация zod) — склеиваем. Любой не-JSON — возвращаем как есть.
export function extractApiErrorMessage(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Partial<ApiErrorResponse>;
    if (Array.isArray(parsed.message)) return parsed.message.join("; ");
    if (typeof parsed.message === "string") return parsed.message;
    return raw;
  } catch {
    return raw;
  }
}
