import { randomUUID } from "crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import type { Request, Response } from "express";
import type { Params } from "nestjs-pino";
import type { RequestUser } from "./request-user";

const VALID_LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);
const TRACE_ID_MAX_LENGTH = 128;
const SAFE_TRACE_ID_PATTERN = /^[A-Za-z0-9._:/=@-]+$/;
const MAX_LOG_REDACTION_DEPTH = 8;
const SENSITIVE_LOG_QUERY_PATTERN = /\b([^=\s&?]+)=([^&\s]+)/g;
const BEARER_TOKEN_PATTERN = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
const BASIC_TOKEN_PATTERN = /Basic\s+[A-Za-z0-9._~+/=-]+/gi;
const SENSITIVE_LOG_KEY_PARTS = ["password", "token", "secret", "authorization", "cookie", "csrf", "session"];
const SENSITIVE_CODE_KEYS = new Set(["code", "verificationcode", "emailverificationcode", "otp", "otpcode"]);
const SAFE_CODE_KEYS = new Set(["statuscode", "httpstatuscode", "status", "postcode", "zipcode", "nomenclaturecode"]);

export const LOG_REDACTED = "[redacted]";

type EnvLike = Partial<Record<"LOG_LEVEL" | "NODE_ENV" | "PINO_PRETTY", string | undefined>>;
type RequestWithUser = Request & { id?: string | number; user?: RequestUser };
type RequestWithTrace = IncomingMessage & {
  id?: string | number;
  originalUrl?: string;
  path?: string;
  ip?: string;
};

export function createLoggerModuleOptions(env: EnvLike = process.env): Params {
  const pretty = shouldUsePrettyLogger(env);

  return {
    pinoHttp: {
      level: resolveLogLevel(env),
      transport: pretty
        ? {
            target: "pino-pretty",
            options: {
              colorize: true,
              singleLine: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          }
        : undefined,
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers['x-csrf-token']",
          "req.headers['x-verification-code']",
          "request.headers.authorization",
          "request.headers.cookie",
          "request.headers['x-csrf-token']",
          "request.headers['x-verification-code']",
          "authorization",
          "*.authorization",
          "cookie",
          "*.cookie",
          "csrf",
          "*.csrf",
          "csrfToken",
          "*.csrfToken",
          "code",
          "*.code",
          "verificationCode",
          "*.verificationCode",
          "emailVerificationCode",
          "*.emailVerificationCode",
          "otp",
          "*.otp",
          "sessionId",
          "*.sessionId",
          "password",
          "*.password",
          "*.passwordHash",
          "*.refreshTokenHash",
          "*.providerToken",
          "*.keyHash",
          "*.accessToken",
          "*.refreshToken",
        ],
        censor: LOG_REDACTED,
      },
      genReqId: (req, res) => resolveTraceId(req.headers, res),
      customAttributeKeys: {
        reqId: "traceId",
        responseTime: "durationMs",
      },
      serializers: {
        req: (req: RequestWithTrace) => ({
          id: req.id,
          method: req.method,
          path: requestPath(req),
          url: requestPath(req),
          remoteAddress: req.ip ?? req.socket?.remoteAddress,
        }),
        res: (res: Response) => ({
          statusCode: res.statusCode,
        }),
      },
      customProps: (req: IncomingMessage, res: ServerResponse) => {
        const request = req as RequestWithUser;
        const response = res as Response;
        const user = request.user;
        return {
          userId: user?.id ?? null,
          sessionId: user?.sessionId ? LOG_REDACTED : null,
          companyId: user?.companyId ?? null,
          actorRole: resolveActorRole(user),
          traceId: request.id ? String(request.id) : null,
          path: requestPath(request),
          method: request.method,
          statusCode: response.statusCode,
        };
      },
      customLogLevel: (_req: IncomingMessage, res: ServerResponse, error?: Error) => {
        if (error || res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      customSuccessMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method ?? "HTTP"} ${requestPath(req)} completed with ${res.statusCode}`,
      customErrorMessage: (req: IncomingMessage, res: ServerResponse) =>
        `${req.method ?? "HTTP"} ${requestPath(req)} failed with ${res.statusCode}`,
    },
  };
}

export function resolveLogLevel(env: EnvLike = process.env): string {
  const configured = env.LOG_LEVEL?.toLowerCase();
  if (configured && VALID_LOG_LEVELS.has(configured)) {
    return configured;
  }
  if (env.NODE_ENV === "test") {
    return "silent";
  }
  return env.NODE_ENV === "production" ? "info" : "debug";
}

export function shouldUsePrettyLogger(env: EnvLike = process.env): boolean {
  return env.NODE_ENV !== "production" && env.NODE_ENV !== "test" && env.PINO_PRETTY !== "0";
}

export function resolveActorRole(user?: RequestUser | null): string {
  if (!user) return "anonymous";
  if (user.platformRoles.includes("admin")) return "admin";
  if (user.platformRoles.includes("moderator")) return "moderator";
  if (user.platformRoles.includes("content_manager")) return "content_manager";
  return "company_user";
}

export function normalizeTraceId(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate) return null;
  const trimmed = candidate.trim();
  if (!trimmed || trimmed.length > TRACE_ID_MAX_LENGTH || !SAFE_TRACE_ID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_LOG_REDACTION_DEPTH) return LOG_REDACTED;
  if (typeof value === "string") return redactLogString(value);
  if (Array.isArray(value)) return value.map((item) => redactLogValue(item, depth + 1));
  if (isPlainRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        isSensitiveLogKey(key) ? LOG_REDACTED : redactLogValue(nested, depth + 1),
      ]),
    );
  }
  return value;
}

export function redactLogString(value: string): string {
  return value
    .replace(SENSITIVE_LOG_QUERY_PATTERN, (match, key: string) =>
      isSensitiveLogKey(key) ? `${key}=${LOG_REDACTED}` : match,
    )
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${LOG_REDACTED}`)
    .replace(BASIC_TOKEN_PATTERN, `Basic ${LOG_REDACTED}`);
}

export function requestPath(req: Pick<RequestWithTrace, "originalUrl" | "path" | "url">): string {
  const raw = req.path ?? req.originalUrl ?? req.url ?? "";
  return raw.split("?")[0] ?? raw;
}

function resolveTraceId(headers: IncomingHttpHeaders, response: ServerResponse): string {
  const traceId = normalizeTraceId(headers["x-request-id"]) ?? randomUUID();
  response.setHeader("X-Request-Id", traceId);
  return traceId;
}

function isSensitiveLogKey(key: string): boolean {
  const normalized = key.replace(/[-_\s.]/g, "").toLowerCase();
  if (SAFE_CODE_KEYS.has(normalized)) return false;
  return SENSITIVE_CODE_KEYS.has(normalized) || SENSITIVE_LOG_KEY_PARTS.some((part) => normalized.includes(part));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
