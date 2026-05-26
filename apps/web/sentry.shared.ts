import type { ErrorEvent, EventHint } from "@sentry/nextjs";

const FILTERED = "[Filtered]";
const DEFAULT_TRACES_SAMPLE_RATE = 0;
const MAX_SANITIZE_DEPTH = 8;

const SENSITIVE_KEY_PATTERN =
  /password|token|secret|authorization|cookie|csrf|session|email|phone|address|inn|kpp|ogrn|bank|account|providerToken|keyHash|refreshTokenHash|accessToken|refreshToken/i;

type UnknownRecord = Record<string, unknown>;

export function beforeSendWebEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  const status = resolveHttpStatus(event, hint);
  if (status !== null && status >= 400 && status < 500) {
    return null;
  }
  return sanitizeSentryEvent(event);
}

export function sanitizeSentryEvent(event: ErrorEvent): ErrorEvent {
  return {
    ...event,
    request: event.request
      ? {
          ...event.request,
          headers: redactRecord(event.request.headers),
          cookies: undefined,
          data: redactValue(event.request.data),
          env: redactRecord(event.request.env),
          url: redactUrl(event.request.url),
          query_string: redactValue(event.request.query_string) as typeof event.request.query_string,
        }
      : undefined,
    user: event.user ? { id: event.user.id } : undefined,
    extra: redactRecord(event.extra),
    contexts: redactRecord(event.contexts),
    breadcrumbs: event.breadcrumbs?.map((breadcrumb) => ({
      ...breadcrumb,
      data: redactRecord(breadcrumb.data),
      message: redactString(breadcrumb.message),
    })),
    exception: event.exception
      ? {
          ...event.exception,
          values: event.exception.values?.map((value) => ({
            ...value,
            value: redactString(value.value),
          })),
        }
      : undefined,
    message: redactString(event.message),
    logentry: event.logentry
      ? {
          ...event.logentry,
          message: redactString(event.logentry.message),
          params: redactValue(event.logentry.params) as unknown[],
        }
      : undefined,
  };
}

export function resolveSentryTraceSampleRate(raw: string | undefined): number {
  if (!raw) return DEFAULT_TRACES_SAMPLE_RATE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE;
  }
  return parsed;
}

function resolveHttpStatus(event: ErrorEvent, hint: EventHint): number | null {
  return (
    readStatusLike(hint.originalException) ??
    readStatusLike(event.extra) ??
    readStatusLike(event.contexts?.response) ??
    readStatusLike(event.contexts?.http) ??
    readStatusLike(event.tags)
  );
}

function readStatusLike(value: unknown): number | null {
  if (!isRecord(value)) return null;
  const status = value.status ?? value.statusCode ?? value.status_code ?? value.httpStatus;
  const numeric = typeof status === "string" ? Number(status) : status;
  return typeof numeric === "number" && Number.isInteger(numeric) ? numeric : null;
}

function redactRecord<T extends Record<string, unknown> | undefined>(record: T, depth = 0): T {
  if (!record) return record;
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? FILTERED : redactValue(value, depth + 1),
    ]),
  ) as T;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined || depth > MAX_SANITIZE_DEPTH) return value;
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (isRecord(value)) return redactRecord(value, depth + 1);
  return value;
}

function redactString(value: string | undefined): string | undefined {
  if (!value) return value;
  return value
    .replace(/(password|token|secret|authorization|cookie|csrf|session)=([^&\s]+)/gi, `$1=${FILTERED}`)
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${FILTERED}`);
}

function redactUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(/([?&](?:token|password|secret|csrf|session|email)=)[^&]+/gi, `$1${FILTERED}`);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
