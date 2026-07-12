import { ServiceUnavailableException } from "@nestjs/common";
import { AccountContactChangeField } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "./account.service";
import { hashEmailVerificationCode } from "../auth/email-verification-code.helpers";

vi.mock("../auth/auth-profile.helpers", () => ({
  getAuthMeUser: vi.fn().mockResolvedValue({ id: "user-1", email: "new@test.local" }),
}));

const ORIGINAL_ENV = { ...process.env };

function createService(
  prisma: Record<string, unknown>,
  email: Record<string, unknown>,
  sessionCache: Record<string, unknown> = { invalidateUser: vi.fn() },
) {
  return new AccountService(prisma as never, {} as never, {} as never, email as never, sessionCache as never);
}

describe("AccountService contact change email fallback", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.EMAIL_VERIFICATION_SECRET = "test-email-secret-12345678901234567890";
    process.env.EMAIL_VERIFICATION_TEST_CODE = "1234";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it("не возвращает challenge смены контакта, если SMTP не отправил код", async () => {
    const now = new Date("2026-06-19T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: "user@example.test" }),
      },
      accountContactChangeChallenge: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const email = {
      sendAccountContactChangeCode: vi.fn().mockRejectedValue(new ServiceUnavailableException("SMTP недоступен.")),
    };
    const service = createService(prisma, email);

    await expect(service.startContactChange("user-1", { field: AccountContactChangeField.email })).rejects.toThrow(
      "SMTP недоступен.",
    );

    expect(email.sendAccountContactChangeCode).toHaveBeenCalledWith({
      to: "user@example.test",
      field: AccountContactChangeField.email,
      code: expect.stringMatching(/^\d{4}$/),
      expiresAt: new Date("2026-06-19T12:15:00.000Z"),
    });
    expect(prisma.accountContactChangeChallenge.updateMany).toHaveBeenLastCalledWith({
      where: { id: expect.any(String), consumedAt: null },
      data: { expiresAt: now },
    });
  });
});

describe("AccountService onboarding tours", () => {
  it("добавляет ключ тура к пройденным и возвращает свежего AuthMeUser", async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ onboardingToursCompleted: ["platform"] }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = createService(prisma, {});

    const result = await service.completeOnboardingTour("user-1", "indices");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { onboardingToursCompleted: ["platform", "indices"] },
    });
    expect(result).toEqual({ id: "user-1", email: "new@test.local" });
  });

  it("идемпотентен: уже пройденный тур не пишет в БД повторно", async () => {
    const prisma = {
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({ onboardingToursCompleted: ["platform"] }),
        update: vi.fn(),
      },
    };
    const service = createService(prisma, {});

    await service.completeOnboardingTour("user-1", "platform");

    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("AccountService two-sided email change (M-9)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.EMAIL_VERIFICATION_SECRET = "test-email-secret-12345678901234567890";
    process.env.EMAIL_VERIFICATION_TEST_CODE = "1234";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("apply email НЕ применяет адрес, а отправляет код на новый адрес (requiresNewCode)", async () => {
    const challenge = {
      id: "ch-1",
      userId: "user-1",
      field: AccountContactChangeField.email,
      email: "old@test.local",
      verifiedAt: new Date("2026-06-21T12:00:00.000Z"),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
    const prisma = {
      accountContactChangeChallenge: {
        findUnique: vi.fn().mockResolvedValue(challenge),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue(null), // адрес свободен
        update: vi.fn(),
      },
    };
    const email = { sendNewEmailVerificationCode: vi.fn().mockResolvedValue(undefined) };
    const service = createService(prisma, email);

    const result = await service.applyContactChange("user-1", {
      field: "email",
      verificationId: "ch-1",
      email: "New.Email@TEST.Local",
    });

    expect(result).toEqual({
      requiresNewCode: true,
      verificationId: "ch-1",
      email: "new.email@test.local",
      expiresAt: expect.any(String),
    });
    // Код ушёл на НОВЫЙ адрес (нормализованный), пользователь НЕ изменён.
    expect(email.sendNewEmailVerificationCode).toHaveBeenCalledWith({
      to: "new.email@test.local",
      code: expect.stringMatching(/^\d{4}$/),
      expiresAt: expect.any(Date),
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    // Pending-сторона записана в challenge.
    expect(prisma.accountContactChangeChallenge.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pendingValue: "new.email@test.local",
          pendingCodeHash: expect.any(String),
          pendingAttempts: 0,
        }),
      }),
    );
  });

  it("confirm применяет новый email и шлёт алерт на старый адрес", async () => {
    const challenge = {
      id: "ch-2",
      userId: "user-1",
      field: AccountContactChangeField.email,
      email: "old@test.local",
      verifiedAt: new Date("2026-06-21T12:00:00.000Z"),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pendingValue: "new@test.local",
      pendingCodeHash: hashEmailVerificationCode("ch-2", "new@test.local", "1234"),
      pendingAttempts: 0,
    };
    const tx = {
      accountContactChangeChallenge: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { update: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      accountContactChangeChallenge: { findUnique: vi.fn().mockResolvedValue(challenge) },
      user: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    };
    const email = { sendContactChangeAlert: vi.fn().mockResolvedValue(undefined) };
    const sessionCache = { invalidateUser: vi.fn().mockResolvedValue(undefined) };
    const service = createService(prisma, email, sessionCache);

    const result = await service.confirmContactChange("user-1", { verificationId: "ch-2", code: "1234" });

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { email: "new@test.local" } });
    expect(email.sendContactChangeAlert).toHaveBeenCalledWith({ to: "old@test.local", field: "email" });
    expect(sessionCache.invalidateUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({ id: "user-1", email: "new@test.local" });
  });

  it("confirm с неверным кодом не применяет смену и увеличивает попытки", async () => {
    const challenge = {
      id: "ch-3",
      userId: "user-1",
      field: AccountContactChangeField.email,
      email: "old@test.local",
      verifiedAt: new Date("2026-06-21T12:00:00.000Z"),
      consumedAt: null,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      pendingValue: "new@test.local",
      pendingCodeHash: hashEmailVerificationCode("ch-3", "new@test.local", "1234"),
      pendingAttempts: 0,
    };
    const prisma = {
      accountContactChangeChallenge: {
        findUnique: vi.fn().mockResolvedValue(challenge),
        update: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(),
    };
    const email = { sendContactChangeAlert: vi.fn() };
    const service = createService(prisma, email);

    await expect(service.confirmContactChange("user-1", { verificationId: "ch-3", code: "0000" })).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(email.sendContactChangeAlert).not.toHaveBeenCalled();
    expect(prisma.accountContactChangeChallenge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ pendingAttempts: 1 }) }),
    );
  });
});
