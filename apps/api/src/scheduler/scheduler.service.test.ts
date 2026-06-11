import { afterEach, describe, expect, it, vi } from "vitest";
import { SchedulerService } from "./scheduler.service";

const PENDING_DELETION = "pending_deletion";

function buildService(lockAcquired = true) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: lockAcquired }]),
  };
  const prisma = {
    $transaction: vi.fn((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    fileAsset: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    emailVerificationChallenge: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    idempotencyKey: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    notificationDelivery: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    address: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const billing = {
    runHourlyCheck: vi.fn().mockResolvedValue({}),
  };
  const files = {
    deleteIfUnreferenced: vi.fn().mockResolvedValue(0),
  };

  return {
    billing,
    files,
    prisma,
    service: new SchedulerService(billing as any, prisma as any, files as any),
    tx,
  };
}

describe("SchedulerService", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("запускает hourly billing check только после успешного Postgres advisory lock", async () => {
    const { billing, prisma, service, tx } = buildService(true);

    await service.handleHourlyBillingCheck();

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { maxWait: 5_000, timeout: 900_000 });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(String(tx.$queryRaw.mock.calls[0][0][0])).toContain("pg_try_advisory_xact_lock");
    expect(tx.$queryRaw.mock.calls[0][1]).toBe("cron:billing-hourly-check");
    expect(billing.runHourlyCheck).toHaveBeenCalledTimes(1);
  });

  it("пропускает tick, если advisory lock уже держит другая реплика", async () => {
    const { billing, service } = buildService(false);

    await service.handleHourlyBillingCheck();

    expect(billing.runHourlyCheck).not.toHaveBeenCalled();
  });

  it("не трогает БД, когда scheduler отключён переменной окружения", async () => {
    vi.stubEnv("SCHEDULER_DISABLED", "1");
    const { billing, prisma, service } = buildService(true);

    await service.handleHourlyBillingCheck();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(billing.runHourlyCheck).not.toHaveBeenCalled();
  });

  it("логирует ошибку cron и не пробрасывает её наружу", async () => {
    const { billing, service } = buildService(true);
    const error = new Error("boom");
    billing.runHourlyCheck.mockRejectedValueOnce(error);
    const loggerError = vi.spyOn((service as any).logger, "error").mockImplementation(() => undefined);

    await expect(service.handleHourlyBillingCheck()).resolves.toBeUndefined();

    expect(loggerError).toHaveBeenCalledWith("Hourly billing check failed", error);
  });

  it("берёт row-lock на кандидатов cleanup перед удалением данных", async () => {
    const now = new Date("2026-05-28T03:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "user-1", companyId: "company-1" }]),
      fileAsset: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        count: vi.fn().mockResolvedValue(0),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      company: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn().mockResolvedValue({
          status: PENDING_DELETION,
          statusBeforeDeletion: "demo",
          factualAddressId: "address-1",
          structuredLegalAddressId: null,
        }),
        update: vi.fn(),
      },
      address: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: vi.fn((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const billing = {
      runHourlyCheck: vi.fn(),
    };
    const files = {
      deleteIfUnreferenced: vi.fn(),
    };
    const service = new SchedulerService(billing as any, prisma as any, files as any);

    const result = await service.cleanupDeletedAccounts(now);

    const queryParts = (tx.$queryRaw.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(queryParts).toContain('FROM "User"');
    expect(queryParts).toContain('WHERE "deletionRequestedAt" <');
    expect(queryParts).toContain("FOR UPDATE");
    expect(tx.$queryRaw.mock.calls[0][2]).toBe(500);
    expect(tx.fileAsset.deleteMany).toHaveBeenCalledWith({
      where: {
        uploadedById: { in: ["user-1"] },
        references: { none: {} },
      },
    });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["user-1"] } } });
    expect(result).toEqual({ deletedUsers: 1, deletedCompanies: 1 });
  });

  it("находит файлы без ссылок старше недели и отдаёт их в deleteIfUnreferenced", async () => {
    const now = new Date("2026-05-29T03:30:00.000Z");
    const prisma = {
      fileAsset: {
        findMany: vi.fn().mockResolvedValue([{ id: "orphan-1" }, { id: "orphan-2" }]),
      },
    };
    const files = {
      deleteIfUnreferenced: vi.fn().mockResolvedValue(2),
    };
    const service = new SchedulerService({ runHourlyCheck: vi.fn() } as any, prisma as any, files as any);

    const result = await service.cleanupOrphanFiles(now);

    const where = prisma.fileAsset.findMany.mock.calls[0][0].where;
    expect(where.references).toEqual({ none: {} });
    // грейс ровно неделя: cutoff = now - 7d
    expect(where.createdAt.lt).toEqual(new Date("2026-05-22T03:30:00.000Z"));
    expect(files.deleteIfUnreferenced).toHaveBeenCalledWith(["orphan-1", "orphan-2"]);
    expect(result).toEqual({ scanned: 2, deleted: 2 });
  });

  it("не вызывает deleteIfUnreferenced, когда осиротевших файлов нет", async () => {
    const prisma = {
      fileAsset: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const files = { deleteIfUnreferenced: vi.fn() };
    const service = new SchedulerService({ runHourlyCheck: vi.fn() } as any, prisma as any, files as any);

    const result = await service.cleanupOrphanFiles(new Date());

    expect(files.deleteIfUnreferenced).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 0, deleted: 0 });
  });

  it("запускает orphan-cleanup только под Postgres advisory lock", async () => {
    const { files, service, tx } = buildService(true);

    await service.handleOrphanFileCleanup();

    expect(tx.$queryRaw.mock.calls[0][1]).toBe("cron:cleanup-orphan-files");
    // findMany вернул [], поэтому до удаления дело не дошло
    expect(files.deleteIfUnreferenced).not.toHaveBeenCalled();
  });

  it("пропускает orphan-cleanup, если advisory lock держит другая реплика", async () => {
    const { files, service } = buildService(false);

    await service.handleOrphanFileCleanup();

    expect(files.deleteIfUnreferenced).not.toHaveBeenCalled();
  });

  it("не трогает файлы, когда scheduler отключён переменной окружения", async () => {
    vi.stubEnv("SCHEDULER_DISABLED", "1");
    const { files, prisma, service } = buildService(true);

    await service.handleOrphanFileCleanup();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(files.deleteIfUnreferenced).not.toHaveBeenCalled();
  });

  it("удаляет отработавшие email-challenge старше суток по expiresAt", async () => {
    const now = new Date("2026-06-02T04:00:00.000Z");
    const prisma = {
      emailVerificationChallenge: {
        deleteMany: vi.fn().mockResolvedValue({ count: 7 }),
      },
    };
    const service = new SchedulerService(
      { runHourlyCheck: vi.fn() } as any,
      prisma as any,
      { deleteIfUnreferenced: vi.fn() } as any,
    );

    const result = await service.cleanupExpiredEmailChallenges(now);

    // грейс ровно сутки: cutoff = now - 24h
    expect(prisma.emailVerificationChallenge.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date("2026-06-01T04:00:00.000Z") } },
    });
    expect(result).toEqual({ deleted: 7 });
  });

  it("запускает очистку email-challenge только под Postgres advisory lock", async () => {
    const { prisma, service, tx } = buildService(true);

    await service.handleEmailChallengeCleanup();

    expect(tx.$queryRaw.mock.calls[0][1]).toBe("cron:cleanup-email-challenges");
    expect(prisma.emailVerificationChallenge.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("пропускает очистку email-challenge, если advisory lock держит другая реплика", async () => {
    const { prisma, service } = buildService(false);

    await service.handleEmailChallengeCleanup();

    expect(prisma.emailVerificationChallenge.deleteMany).not.toHaveBeenCalled();
  });

  it("не чистит email-challenge, когда scheduler отключён переменной окружения", async () => {
    vi.stubEnv("SCHEDULER_DISABLED", "1");
    const { prisma, service } = buildService(true);

    await service.handleEmailChallengeCleanup();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.emailVerificationChallenge.deleteMany).not.toHaveBeenCalled();
  });

  it("удаляет истёкшие сессии старше недели по expiresAt", async () => {
    const now = new Date("2026-06-04T02:00:00.000Z");
    const prisma = {
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) },
    };
    const service = new SchedulerService(
      { runHourlyCheck: vi.fn() } as any,
      prisma as any,
      { deleteIfUnreferenced: vi.fn() } as any,
    );

    const result = await service.cleanupExpiredSessions(now);

    // грейс ровно неделя: cutoff = now - 7d
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date("2026-05-28T02:00:00.000Z") } },
    });
    expect(result).toEqual({ deleted: 3 });
  });

  it("удаляет ключи идемпотентности старше 30 дней по createdAt", async () => {
    const now = new Date("2026-06-04T02:00:00.000Z");
    const prisma = {
      idempotencyKey: { deleteMany: vi.fn().mockResolvedValue({ count: 5 }) },
    };
    const service = new SchedulerService(
      { runHourlyCheck: vi.fn() } as any,
      prisma as any,
      { deleteIfUnreferenced: vi.fn() } as any,
    );

    const result = await service.cleanupStaleIdempotencyKeys(now);

    // грейс ровно 30 дней: cutoff = now - 30d
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-05-05T02:00:00.000Z") } },
    });
    expect(result).toEqual({ deleted: 5 });
  });

  it("удаляет записи доставки нотификаций старше 90 дней по createdAt", async () => {
    const now = new Date("2026-06-04T02:00:00.000Z");
    const prisma = {
      notificationDelivery: { deleteMany: vi.fn().mockResolvedValue({ count: 11 }) },
    };
    const service = new SchedulerService(
      { runHourlyCheck: vi.fn() } as any,
      prisma as any,
      { deleteIfUnreferenced: vi.fn() } as any,
    );

    const result = await service.cleanupStaleNotificationDeliveries(now);

    // грейс ровно 90 дней: cutoff = now - 90d
    expect(prisma.notificationDelivery.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-03-06T02:00:00.000Z") } },
    });
    expect(result).toEqual({ deleted: 11 });
  });

  it("удаляет адреса без привязки к компании или объявлению", async () => {
    const prisma = {
      address: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
    };
    const service = new SchedulerService(
      { runHourlyCheck: vi.fn() } as any,
      prisma as any,
      { deleteIfUnreferenced: vi.fn() } as any,
    );

    const result = await service.cleanupOrphanAddresses();

    expect(prisma.address.deleteMany).toHaveBeenCalledWith({
      where: {
        companyAsFactual: { is: null },
        companyAsLegal: { is: null },
        marketplaceListing: { is: null },
      },
    });
    expect(result).toEqual({ deleted: 4 });
  });

  it("чистит копящиеся таблицы только под Postgres advisory lock", async () => {
    const { prisma, service, tx } = buildService(true);

    await service.handleStaleRecordCleanup();

    expect(tx.$queryRaw.mock.calls[0][1]).toBe("cron:cleanup-stale-records");
    expect(prisma.session.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.notificationDelivery.deleteMany).toHaveBeenCalledTimes(1);
    expect(prisma.address.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("пропускает очистку копящихся таблиц, если advisory lock держит другая реплика", async () => {
    const { prisma, service } = buildService(false);

    await service.handleStaleRecordCleanup();

    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(prisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
    expect(prisma.notificationDelivery.deleteMany).not.toHaveBeenCalled();
    expect(prisma.address.deleteMany).not.toHaveBeenCalled();
  });

  it("не чистит копящиеся таблицы, когда scheduler отключён переменной окружения", async () => {
    vi.stubEnv("SCHEDULER_DISABLED", "1");
    const { prisma, service } = buildService(true);

    await service.handleStaleRecordCleanup();

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    expect(prisma.address.deleteMany).not.toHaveBeenCalled();
  });
});
