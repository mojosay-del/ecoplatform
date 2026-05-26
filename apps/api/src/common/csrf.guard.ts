import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { randomBytes } from "crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";

export const CSRF_COOKIE_NAME = "csrf-token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const EXEMPT_MUTATING_PATHS = new Set(["/api/auth/login", "/api/auth/register"]);
const CSRF_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type RequestWithCsrf = Request & { csrfToken?: string };

function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  };
}

function createCsrfToken() {
  return randomBytes(32).toString("base64url");
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isValidCsrfToken(value: unknown): value is string {
  return typeof value === "string" && CSRF_TOKEN_PATTERN.test(value);
}

function requestPath(request: Request): string {
  return (request.originalUrl || request.url || "").split("?")[0] || request.path;
}

export function csrfCookieMiddleware(request: RequestWithCsrf, response: Response, next: NextFunction) {
  const currentToken = stringValue(request.cookies?.[CSRF_COOKIE_NAME]);
  const token = isValidCsrfToken(currentToken) ? currentToken : createCsrfToken();

  request.csrfToken = token;
  if (token !== currentToken) {
    response.cookie(CSRF_COOKIE_NAME, token, csrfCookieOptions());
  }

  next();
}

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithCsrf>();
    const method = request.method.toUpperCase();

    if (SAFE_METHODS.has(method) || EXEMPT_MUTATING_PATHS.has(requestPath(request))) {
      return true;
    }

    const cookieToken = stringValue(request.cookies?.[CSRF_COOKIE_NAME]);
    const headerToken = request.header(CSRF_HEADER_NAME);

    if (!isValidCsrfToken(cookieToken) || !isValidCsrfToken(headerToken) || cookieToken !== headerToken) {
      throw new ForbiddenException("CSRF-токен отсутствует или недействителен.");
    }

    return true;
  }
}
