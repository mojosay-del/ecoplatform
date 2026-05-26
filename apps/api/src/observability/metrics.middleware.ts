import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { observeHttpRequest } from "./metrics.registry";

type RequestWithRoute = Request & {
  route?: { path?: unknown };
};

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  use(request: RequestWithRoute, response: Response, next: NextFunction): void {
    const startedAt = process.hrtime.bigint();

    response.on("finish", () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000_000;
      observeHttpRequest(
        {
          method: request.method.toUpperCase(),
          route: routeLabel(request),
          status: String(response.statusCode),
        },
        durationSeconds,
      );
    });

    next();
  }
}

function routeLabel(request: RequestWithRoute): string {
  const routePath = pathToLabel(request.route?.path);
  if (!routePath) {
    return "unmatched";
  }

  return normalizePath(`${request.baseUrl ?? ""}${routePath}`);
}

function pathToLabel(path: unknown): string | null {
  if (typeof path === "string") return path;
  if (Array.isArray(path)) {
    const parts = path.filter((item): item is string => typeof item === "string");
    return parts.length ? parts.join("|") : null;
  }
  return null;
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\/+/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}
