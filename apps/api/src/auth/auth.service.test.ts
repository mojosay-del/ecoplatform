import { compare } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

vi.mock("bcryptjs", () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

function createService(prisma: Record<string, unknown>) {
  return new AuthService(
    prisma as any,
    {} as any,
    {} as any,
    { createInApp: vi.fn() } as any,
    { invalidateUser: vi.fn(), invalidateSession: vi.fn() } as any,
  );
}

describe("AuthService login", () => {
  beforeEach(() => {
    vi.mocked(compare).mockReset();
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
});
