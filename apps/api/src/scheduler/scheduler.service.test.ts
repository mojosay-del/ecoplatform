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
});
