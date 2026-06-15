import { describe, expect, it } from "vitest";
import { CompanyRole } from "@prisma/client";
import { normalizeTraceId, resolveActorRole, resolveLogLevel, shouldUsePrettyLogger } from "./logging";
import type { RequestUser } from "./request-user";

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
});
