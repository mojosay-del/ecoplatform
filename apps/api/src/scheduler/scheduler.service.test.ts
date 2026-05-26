import { afterEach, describe, expect, it, vi } from "vitest";
import { SchedulerService } from "./scheduler.service";

function buildService(lockAcquired = true) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ ok: lockAcquired }]),
  };
  const prisma = {
    $transaction: vi.fn((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
  };
  const billing = {
    runHourlyCheck: vi.fn().mockResolvedValue({}),
  };

  return {
    billing,
    prisma,
    service: new SchedulerService(billing as any, prisma as any),
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
});
