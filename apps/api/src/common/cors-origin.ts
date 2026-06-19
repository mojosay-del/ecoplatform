import type { CustomOrigin } from "@nestjs/common/interfaces/external/cors-options.interface";

const DEFAULT_DEV_WEB_ORIGIN = "http://localhost:3000";

export interface CorsOriginEnv {
  NODE_ENV?: string;
  WEB_ORIGINS?: string;
}

function normalizeCorsOrigin(value: string): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`WEB_ORIGINS содержит некорректный origin: ${value}`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`WEB_ORIGINS поддерживает только http/https origin: ${value}`);
  }

  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`WEB_ORIGINS должен содержать только origin без path/query/hash: ${value}`);
  }

  return url.origin;
}

export function resolveAllowedCorsOrigins(env: CorsOriginEnv = process.env): string[] {
  const rawOrigins = env.WEB_ORIGINS?.trim();

  if (!rawOrigins) {
    if (env.NODE_ENV === "production") {
      throw new Error("Переменная окружения WEB_ORIGINS обязательна в production.");
    }

    return [DEFAULT_DEV_WEB_ORIGIN];
  }

  const origins = rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map(normalizeCorsOrigin);
  const uniqueOrigins = [...new Set(origins)];

  if (uniqueOrigins.length === 0) {
    throw new Error("WEB_ORIGINS должен содержать хотя бы один origin.");
  }

  return uniqueOrigins;
}

export function createCorsOriginValidator(allowedOrigins: readonly string[]): CustomOrigin {
  const allowlist = new Set(allowedOrigins);

  return (requestOrigin, callback) => {
    if (!requestOrigin) {
      callback(null, true);
      return;
    }

    callback(null, allowlist.has(requestOrigin) ? true : false);
  };
}

export function createCorsOrigin(env: CorsOriginEnv = process.env): CustomOrigin {
  return createCorsOriginValidator(resolveAllowedCorsOrigins(env));
}
