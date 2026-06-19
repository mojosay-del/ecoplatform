import { ServiceUnavailableException } from "@nestjs/common";
import { AccountContactChangeField } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountService } from "./account.service";

const ORIGINAL_ENV = { ...process.env };

function createService(prisma: Record<string, unknown>, email: Record<string, unknown>) {
  return new AccountService(
    prisma as never,
    {} as never,
    {} as never,
    email as never,
    { invalidateUser: vi.fn() } as never,
  );
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
