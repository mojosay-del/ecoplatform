import { ExecutionContext } from "@nestjs/common";
import { CompanyRole, UserStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { RequestUser } from "./request-user";
import { JwtAuthGuard } from "./jwt-auth.guard";

function contextWithRequest(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

function requestUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: "user-1",
    email: "user@example.test",
    firstName: "Иван",
    lastName: "Иванов",
    phone: "+70000000000",
    companyId: "company-1",
    companyRole: CompanyRole.owner,
    platformRoles: ["admin"],
    company: {
      type: "collector",
      status: "active",
      demoEndsAt: null,
      subscriptionPlan: "demo",
      subscriptionEndsAt: null,
    },
    sessionId: "session-1",
    ...overrides,
  };
}

describe("JwtAuthGuard session cache", () => {
  it("использует кешированную сессию после проверки JWT и не ходит в БД", async () => {
    const cached = requestUser();
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: cached.id, sessionId: cached.sessionId }) };
    const prisma = { user: { findUnique: vi.fn() } };
    const sessionCache = { get: vi.fn().mockResolvedValue(cached), set: vi.fn() };
    const guard = new JwtAuthGuard(jwt as any, prisma as any, sessionCache as any);
    const request = { header: vi.fn().mockReturnValue("Bearer access-token") };

    await expect(guard.canActivate(contextWithRequest(request))).resolves.toBe(true);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(sessionCache.set).not.toHaveBeenCalled();
    expect(request).toMatchObject({ user: cached });
  });

  it("перечитывает пользователя из БД, если в кеше старая сессия без companyRole", async () => {
    const staleCached = { ...requestUser() } as Partial<RequestUser>;
    delete staleCached.companyRole;
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: "user-1", sessionId: "session-1" }) };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "user@example.test",
          firstName: "Иван",
          lastName: "Иванов",
          phone: "+70000000000",
          companyId: "company-1",
          companyRole: CompanyRole.owner,
          status: UserStatus.active,
          platformStaff: { isActive: true, roles: ["admin"] },
          sessions: [{ id: "session-1" }],
          company: {
            type: "collector",
            status: "active",
            demoEndsAt: null,
            subscriptionPlan: "demo",
            subscriptionEndsAt: null,
          },
        }),
      },
    };
    const sessionCache = { get: vi.fn().mockResolvedValue(staleCached), set: vi.fn().mockResolvedValue(undefined) };
    const guard = new JwtAuthGuard(jwt as any, prisma as any, sessionCache as any);
    const request = { header: vi.fn().mockReturnValue("Bearer access-token") };

    await expect(guard.canActivate(contextWithRequest(request))).resolves.toBe(true);

    expect(prisma.user.findUnique).toHaveBeenCalled();
    expect(sessionCache.set).toHaveBeenCalledWith(requestUser());
    expect(request).toMatchObject({ user: requestUser() });
  });

  it("пишет сессию в кеш после успешной загрузки из БД", async () => {
    const jwt = { verifyAsync: vi.fn().mockResolvedValue({ sub: "user-1", sessionId: "session-1" }) };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          email: "user@example.test",
          firstName: "Иван",
          lastName: "Иванов",
          phone: "+70000000000",
          companyId: "company-1",
          companyRole: CompanyRole.owner,
          status: UserStatus.active,
          platformStaff: { isActive: true, roles: ["admin"] },
          sessions: [{ id: "session-1" }],
          company: {
            type: "collector",
            status: "active",
            demoEndsAt: null,
            subscriptionPlan: "demo",
            subscriptionEndsAt: null,
          },
        }),
      },
    };
    const sessionCache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
    const guard = new JwtAuthGuard(jwt as any, prisma as any, sessionCache as any);
    const request = { header: vi.fn().mockReturnValue("Bearer access-token") };

    await expect(guard.canActivate(contextWithRequest(request))).resolves.toBe(true);

    expect(sessionCache.set).toHaveBeenCalledWith(requestUser());
    expect(request).toMatchObject({ user: requestUser() });
  });
});
