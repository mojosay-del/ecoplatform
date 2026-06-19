import { describe, expect, it } from "vitest";
import { CompanyRole } from "@prisma/client";
import {
  LOG_REDACTED,
  createLoggerModuleOptions,
  normalizeTraceId,
  redactLogString,
  redactLogValue,
  requestPath,
  resolveActorRole,
  resolveLogLevel,
  shouldUsePrettyLogger,
} from "./logging";
import type { RequestUser } from "./request-user";

type LoggerOptionsForTest = {
  redact: { paths: string[]; censor: string };
  serializers: {
    req: (request: { id?: string; method?: string; url?: string; socket?: { remoteAddress?: string } }) => {
      path: string;
      url: string;
    };
  };
  customProps: (
    request: { id?: string; method?: string; url?: string; user?: RequestUser },
    response: { statusCode: number },
  ) => { sessionId: string | null; path: string; statusCode: number };
};

const baseUser: RequestUser = {
  id: "user-1",
  email: "user@example.test",
  firstName: "Иван",
  lastName: "Иванов",
  phone: "+70000000000",
  companyId: "company-1",
  companyRole: CompanyRole.owner,
  platformRoles: [],
  company: null,
  sessionId: "session-1",
};

describe("logging config helpers", () => {
  it("honors valid LOG_LEVEL and falls back by environment", () => {
    expect(resolveLogLevel({ LOG_LEVEL: "warn", NODE_ENV: "production" })).toBe("warn");
    expect(resolveLogLevel({ LOG_LEVEL: "verbose", NODE_ENV: "production" })).toBe("info");
    expect(resolveLogLevel({ NODE_ENV: "test" })).toBe("silent");
    expect(resolveLogLevel({ NODE_ENV: "development" })).toBe("debug");
  });

  it("enables pretty logs only outside prod and tests", () => {
    expect(shouldUsePrettyLogger({ NODE_ENV: "development" })).toBe(true);
    expect(shouldUsePrettyLogger({ NODE_ENV: "development", PINO_PRETTY: "0" })).toBe(false);
    expect(shouldUsePrettyLogger({ NODE_ENV: "production" })).toBe(false);
    expect(shouldUsePrettyLogger({ NODE_ENV: "test" })).toBe(false);
  });

  it("normalizes incoming trace ids without allowing unsafe values", () => {
    expect(normalizeTraceId("trace-123")).toBe("trace-123");
    expect(normalizeTraceId(["trace-array"])).toBe("trace-array");
    expect(normalizeTraceId("bad value with spaces")).toBeNull();
    expect(normalizeTraceId("x".repeat(129))).toBeNull();
  });

  it("maps request user roles to stable actorRole values", () => {
    expect(resolveActorRole(null)).toBe("anonymous");
    expect(resolveActorRole(baseUser)).toBe("company_user");
    expect(resolveActorRole({ ...baseUser, platformRoles: ["content_manager"] })).toBe("content_manager");
    expect(resolveActorRole({ ...baseUser, platformRoles: ["moderator", "content_manager"] })).toBe("moderator");
    expect(resolveActorRole({ ...baseUser, platformRoles: ["admin", "moderator"] })).toBe("admin");
  });

  it("keeps pino request logs free from query strings and sensitive paths", () => {
    const options = createLoggerModuleOptions({ NODE_ENV: "production" }).pinoHttp as LoggerOptionsForTest;

    expect(options.redact.censor).toBe(LOG_REDACTED);
    expect(options.redact.paths).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['x-csrf-token']",
        "req.headers['x-verification-code']",
        "authorization",
        "*.authorization",
        "cookie",
        "*.cookie",
        "code",
        "*.code",
        "verificationCode",
        "*.verificationCode",
        "password",
        "*.password",
        "sessionId",
        "*.sessionId",
      ]),
    );

    const serializedRequest = options.serializers.req({
      method: "POST",
      url: "/api/auth/login?token=abc&code=123456",
      socket: { remoteAddress: "127.0.0.1" },
    });
    expect(serializedRequest.path).toBe("/api/auth/login");
    expect(serializedRequest.url).toBe("/api/auth/login");

    const props = options.customProps(
      { id: "trace-1", method: "POST", url: "/api/auth/login?code=123456", user: baseUser },
      { statusCode: 400 },
    );
    expect(props.path).toBe("/api/auth/login");
    expect(props.sessionId).toBe(LOG_REDACTED);
    expect(props.statusCode).toBe(400);
  });

  it("redacts token, password, confirmation code and cookie values in log payloads", () => {
    expect(
      redactLogString(
        "Authorization Bearer token-secret password=secret token=abc code=123456 cookie=refresh statusCode=400",
      ),
    ).toBe(
      `Authorization Bearer ${LOG_REDACTED} password=${LOG_REDACTED} token=${LOG_REDACTED} code=${LOG_REDACTED} cookie=${LOG_REDACTED} statusCode=400`,
    );

    expect(
      redactLogValue({
        password: "secret",
        code: "123456",
        statusCode: 400,
        postcode: "101000",
        nested: {
          authorization: "Bearer abc",
          cookie: "refresh=abc",
          refreshToken: "refresh-secret",
          verificationCode: "654321",
        },
        list: [{ csrfToken: "csrf-secret" }],
      }),
    ).toEqual({
      password: LOG_REDACTED,
      code: LOG_REDACTED,
      statusCode: 400,
      postcode: "101000",
      nested: {
        authorization: LOG_REDACTED,
        cookie: LOG_REDACTED,
        refreshToken: LOG_REDACTED,
        verificationCode: LOG_REDACTED,
      },
      list: [{ csrfToken: LOG_REDACTED }],
    });
  });

  it("normalizes request path without leaking query-string secrets", () => {
    expect(requestPath({ originalUrl: "/api/auth/register?code=123456&token=abc" })).toBe("/api/auth/register");
    expect(requestPath({ path: "/api/auth/login", url: "/api/auth/login?password=secret" })).toBe("/api/auth/login");
  });
});
