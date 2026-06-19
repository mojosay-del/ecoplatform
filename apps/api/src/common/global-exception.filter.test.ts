import { BadRequestException, Logger } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalExceptionFilter } from "./global-exception.filter";
import { LOG_REDACTED } from "./logging";

type TestResponse = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
};

function createResponse(): TestResponse {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

function createHost(request: Partial<Request>, response: TestResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

describe("GlobalExceptionFilter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs 4xx payloads without query-string secrets or sensitive values", () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const filter = new GlobalExceptionFilter();
    const response = createResponse();
    const request = {
      method: "POST",
      originalUrl: "/api/auth/register?token=query-token&code=123456",
      user: { id: "user-1" },
    } as Partial<Request>;

    filter.catch(
      new BadRequestException({
        message: "Invalid token=body-token code=654321 password=body-password cookie=refresh",
        error: "Bad Request",
        statusCode: 400,
        password: "secret-password",
        nested: {
          authorization: "Bearer header-token",
          cookie: "refresh=secret-cookie",
          verificationCode: "111222",
        },
      }),
      createHost(request, response),
    );

    const logLine = String(warnSpy.mock.calls[0]?.[0] ?? "");
    expect(logLine).toContain("POST /api/auth/register [user-1] →400");
    expect(logLine).toContain(LOG_REDACTED);
    expect(logLine).not.toContain("query-token");
    expect(logLine).not.toContain("body-token");
    expect(logLine).not.toContain("654321");
    expect(logLine).not.toContain("secret-password");
    expect(logLine).not.toContain("header-token");
    expect(logLine).not.toContain("secret-cookie");
    expect(logLine).not.toContain("111222");
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalled();
  });

  it("logs 5xx stack traces without query-string secrets or sensitive values", () => {
    const errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const filter = new GlobalExceptionFilter();
    const response = createResponse();
    const request = {
      method: "GET",
      originalUrl: "/api/account?token=query-token&code=123456",
    } as Partial<Request>;

    filter.catch(
      new Error("failed token=stack-token password=stack-password code=999999 cookie=stack-cookie"),
      createHost(request, response),
    );

    const [context, stack] = errorSpy.mock.calls[0] ?? [];
    expect(String(context)).toContain("GET /api/account [anonymous] →500");
    expect(String(context)).not.toContain("query-token");
    expect(String(stack)).toContain(LOG_REDACTED);
    expect(String(stack)).not.toContain("stack-token");
    expect(String(stack)).not.toContain("stack-password");
    expect(String(stack)).not.toContain("999999");
    expect(String(stack)).not.toContain("stack-cookie");
    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      message: "Внутренняя ошибка сервера.",
      error: "InternalServerError",
      statusCode: 500,
    });
  });
});
