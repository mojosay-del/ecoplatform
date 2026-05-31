import { compare, hash } from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

const SETTING_DEFAULTS: Record<string, number | boolean> = {
  "auth.registration_enabled": true,
  "security.login_lockout_threshold": 10,
  "security.login_lockout_window_minutes": 15,
  "security.login_lockout_duration_minutes": 15,
};
const ORIGINAL_JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

function createService(
  prisma: Record<string, unknown>,
  email: Record<string, unknown> = { sendRegistrationCode: vi.fn() },
) {
  return new AuthService(
    prisma as any,
    {} as any,
    { getValue: vi.fn(async (key: string) => SETTING_DEFAULTS[key]) } as any,
    { createInApp: vi.fn() } as any,
    { invalidateUser: vi.fn(), invalidateSession: vi.fn() } as any,
    { assertAcceptablePassword: vi.fn() } as any,
    email as any,
  );
}

describe("AuthService login", () => {
  beforeEach(() => {
    vi.mocked(compare).mockReset();
    vi.mocked(hash).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("делает bcrypt-сравнение с dummy hash, даже если email не найден", async () => {
    vi.mocked(compare).mockResolvedValue(false);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    };
    const service = createService(prisma);

    await expect(
      service.login({ email: "Unknown@TEST.Local", password: "wrong-password" }, { userAgent: "test" }),
    ).rejects.toThrow("Неверный email или пароль.");

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "unknown@test.local" },
      include: { company: true },
    });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(compare).toHaveBeenCalledWith("wrong-password", expect.stringMatching(/^\$2[aby]\$12\$/));
  });

  it("увеличивает счётчик неудачных попыток в 15-минутном окне", async () => {
    const now = new Date("2026-05-26T12:00:00.000Z");
    const windowStartedAt = new Date("2026-05-26T11:55:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(compare).mockResolvedValue(false);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          passwordHash: "$2a$12$real",
          status: "active",
          company: null,
          failedLoginAttempts: 3,
          failedLoginWindowStartedAt: windowStartedAt,
          lockedUntil: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = createService(prisma);

    await expect(
      service.login({ email: "User@TEST.Local", password: "wrong-password" }, { userAgent: "test" }),
    ).rejects.toThrow("Неверный email или пароль.");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        failedLoginAttempts: 4,
        failedLoginWindowStartedAt: windowStartedAt,
        lockedUntil: null,
      },
    });
  });

  it("ставит временную блокировку на десятой ошибке подряд", async () => {
    const now = new Date("2026-05-26T12:00:00.000Z");
    const windowStartedAt = new Date("2026-05-26T11:55:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(compare).mockResolvedValue(false);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          passwordHash: "$2a$12$real",
          status: "active",
          company: null,
          failedLoginAttempts: 9,
          failedLoginWindowStartedAt: windowStartedAt,
          lockedUntil: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const service = createService(prisma);

    await expect(
      service.login({ email: "user@test.local", password: "wrong-password" }, { userAgent: "test" }),
    ).rejects.toThrow("Учётная запись временно заблокирована за слишком много попыток. Попробуйте через 15 минут.");

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        failedLoginAttempts: 10,
        failedLoginWindowStartedAt: windowStartedAt,
        lockedUntil: new Date("2026-05-26T12:15:00.000Z"),
      },
    });
  });

  it("не создаёт сессию и не двигает счётчик, пока lockout активен", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T12:00:00.000Z"));
    vi.mocked(compare).mockResolvedValue(true);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          passwordHash: "$2a$12$real",
          status: "active",
          company: null,
          failedLoginAttempts: 10,
          failedLoginWindowStartedAt: new Date("2026-05-26T11:55:00.000Z"),
          lockedUntil: new Date("2026-05-26T12:10:00.000Z"),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      session: {
        create: vi.fn(),
      },
    };
    const service = createService(prisma);

    await expect(
      service.login({ email: "user@test.local", password: "correct-password" }, { userAgent: "test" }),
    ).rejects.toThrow("Учётная запись временно заблокирована за слишком много попыток. Попробуйте через 10 минут.");

    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});

describe("AuthService registration email", () => {
  beforeEach(() => {
    process.env.JWT_ACCESS_SECRET = "test-access-secret-that-is-long-enough";
    vi.mocked(compare).mockReset();
    vi.mocked(hash).mockReset();
    vi.mocked(hash).mockResolvedValue("hashed-password");
  });

  afterEach(() => {
    if (ORIGINAL_JWT_ACCESS_SECRET === undefined) {
      delete process.env.JWT_ACCESS_SECRET;
    } else {
      process.env.JWT_ACCESS_SECRET = ORIGINAL_JWT_ACCESS_SECRET;
    }
  });

  it("возвращает шаг ввода кода, не ожидая завершения SMTP-отправки", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      legalDocument: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      emailVerificationChallenge: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const email = {
      sendRegistrationCode: vi.fn(() => new Promise<void>(() => undefined)),
    };
    const service = createService(prisma, email);

    const result = await service.register(
      {
        organizationName: "ООО Быстрая регистрация",
        companyType: "collector",
        firstName: "Иван",
        lastName: "Петров",
        gender: "male",
        phone: "+79990000000",
        email: "Fast@Example.Test",
        password: "Password12345",
        acceptedDocumentIds: [],
      },
      { userAgent: "test" },
    );

    expect(result).toEqual({
      verificationId: expect.any(String),
      email: "fast@example.test",
      expiresAt: expect.any(String),
    });
    expect(email.sendRegistrationCode).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "fast@example.test",
        code: expect.stringMatching(/^\d{4}$/),
      }),
    );
  });
});
