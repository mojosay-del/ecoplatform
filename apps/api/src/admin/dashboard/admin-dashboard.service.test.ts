import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDashboardService } from "./admin-dashboard.service";
import type { HealthDependencyIndicator } from "../../health/health-dependency.indicator";
import type { PrismaService } from "../../prisma/prisma.service";

describe("AdminDashboardService", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("собирает KPI, график регистраций и последние события аудита", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T09:15:00.000Z"));
    const prisma = createPrismaMock();
    const health = createHealthMock();
    const service = new AdminDashboardService(prisma, health);

    const result = await service.getSummary();

    expect(result.kpis).toEqual({
      activeUsersToday: 2,
      registrationsToday: 4,
      activeSubscriptions: 2,
      subscriptionsExpiringSoon: 2,
      openModerationCases: 3,
      activeSupportTickets: 5,
    });
    expect(result.business).toEqual({
      conversion: { convertedCompanies: 3, totalCompanies: 10, percent: 30 },
      subscriptionsByPlan: { basic: 1, extended: 1 },
      newSubscriptionsThisMonth: 2,
      companiesByStatus: [
        { status: "demo", count: 6 },
        { status: "active", count: 3 },
        { status: "blocked", count: 1 },
      ],
    });
    expect(result.operations).toEqual({
      pendingDeletionRequests: 7,
      pastDueCompanies: 5,
      lockedAccounts: 2,
    });
    expect(result.systemHealth).toEqual({
      database: "ok",
      redis: "disabled",
      storage: "disabled",
    });
    expect(result.registrationSeries).toEqual([
      { date: "2026-05-26", count: 1 },
      { date: "2026-05-27", count: 4 },
    ]);
    expect(result.recentAuditEvents).toEqual([
      {
        id: "log-1",
        action: "admin.setting.update",
        actor: { id: "admin-1", firstName: "Админ", lastName: "Платформы", email: "admin@example.com" },
        entityType: "PlatformSetting",
        entityLabel: "Настройка платформы",
        comment: "Смена настройки",
        createdAt: "2026-05-27T09:10:00.000Z",
      },
      {
        id: "log-2",
        action: "external.sync",
        actor: null,
        entityType: "ExternalThing",
        entityLabel: "ExternalThing",
        comment: null,
        createdAt: "2026-05-27T09:00:00.000Z",
      },
    ]);
    expect(prisma.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        distinct: ["userId"],
        select: { userId: true },
      }),
    );
    expect(prisma.subscription.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ status: "active" }),
    });
    expect(prisma.adminActionLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    );
  });
});

function createPrismaMock() {
  return {
    session: {
      findMany: vi.fn().mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }]),
    },
    user: {
      count: vi.fn((args?: { where?: Record<string, unknown> }) => {
        if (args?.where && "deletionRequestedAt" in args.where) return Promise.resolve(7);
        if (args?.where && "lockedUntil" in args.where) return Promise.resolve(2);
        return Promise.resolve(4);
      }),
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: "admin-1", firstName: "Админ", lastName: "Платформы", email: "admin@example.com" }]),
    },
    subscription: {
      count: vi.fn().mockResolvedValue(2),
      groupBy: vi.fn().mockResolvedValue([
        { plan: "basic", _count: 1 },
        { plan: "extended", _count: 1 },
      ]),
    },
    company: {
      count: vi.fn((args?: { where?: Record<string, unknown> }) => {
        if (args?.where && "status" in args.where) return Promise.resolve(5);
        if (args?.where && "subscriptions" in args.where) return Promise.resolve(3);
        return Promise.resolve(10);
      }),
      groupBy: vi.fn().mockResolvedValue([
        { status: "active", _count: 3 },
        { status: "demo", _count: 6 },
        { status: "blocked", _count: 1 },
      ]),
    },
    moderationCase: { count: vi.fn().mockResolvedValue(3) },
    supportTicket: { count: vi.fn().mockResolvedValue(5) },
    adminActionLog: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "log-1",
          actorId: "admin-1",
          action: "admin.setting.update",
          entityType: "PlatformSetting",
          comment: "Смена настройки",
          createdAt: new Date("2026-05-27T09:10:00.000Z"),
        },
        {
          id: "log-2",
          actorId: "deleted-admin",
          action: "external.sync",
          entityType: "ExternalThing",
          comment: null,
          createdAt: new Date("2026-05-27T09:00:00.000Z"),
        },
      ]),
    },
    $queryRaw: vi.fn().mockResolvedValue([
      { day: new Date("2026-05-26T00:00:00.000Z"), count: 1n },
      { day: new Date("2026-05-27T00:00:00.000Z"), count: 4 },
    ]),
  } as unknown as PrismaService & {
    session: { findMany: ReturnType<typeof vi.fn> };
    user: { count: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
    subscription: { count: ReturnType<typeof vi.fn> };
    moderationCase: { count: ReturnType<typeof vi.fn> };
    supportTicket: { count: ReturnType<typeof vi.fn> };
    adminActionLog: { findMany: ReturnType<typeof vi.fn> };
    $queryRaw: ReturnType<typeof vi.fn>;
  };
}

function createHealthMock() {
  return {
    database: vi.fn().mockResolvedValue({ database: { status: "up" } }),
    redisCache: vi.fn().mockResolvedValue({ redis: { status: "up", configured: false, mode: "fallback" } }),
    objectStorage: vi.fn().mockResolvedValue({ s3: { status: "up", configured: false, required: false } }),
  } as unknown as HealthDependencyIndicator;
}
