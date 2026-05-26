import { randomUUID } from "crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "http";
import type { Request, Response } from "express";
import type { Params } from "nestjs-pino";
import type { RequestUser } from "./request-user";

const VALID_LOG_LEVELS = new Set(["trace", "debug", "info", "warn", "error", "fatal", "silent"]);
const TRACE_ID_MAX_LENGTH = 128;
const SAFE_TRACE_ID_PATTERN = /^[A-Za-z0-9._:/=@-]+$/;

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
          "request.headers.authorization",
          "request.headers.cookie",
          "password",
          "*.password",
          "*.passwordHash",
          "*.refreshTokenHash",
          "*.providerToken",
          "*.keyHash",
          "*.accessToken",
          "*.refreshToken",
        ],
        censor: "[redacted]",
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
          url: req.url,
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
          sessionId: user?.sessionId ?? null,
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

function resolveTraceId(headers: IncomingHttpHeaders, response: ServerResponse): string {
  const traceId = normalizeTraceId(headers["x-request-id"]) ?? randomUUID();
  response.setHeader("X-Request-Id", traceId);
  return traceId;
}

function requestPath(req: Pick<RequestWithTrace, "originalUrl" | "path" | "url">): string {
  const raw = req.path ?? req.originalUrl ?? req.url ?? "";
  return raw.split("?")[0] ?? raw;
}
