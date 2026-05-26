import { BadRequestException } from "@nestjs/common";
import { createHash } from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordPolicyService } from "./password-policy.service";

const ORIGINAL_ENV = { ...process.env };

function sha1Parts(password: string) {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

describe("PasswordPolicyService", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("отклоняет пароль короче общего минимума", async () => {
    const service = new PasswordPolicyService();

    await expect(service.assertAcceptablePassword("Short12345")).rejects.toThrow(BadRequestException);
  });

  it("проверяет SHA-1 suffix через Pwned Passwords range API", async () => {
    const password = "Password12345";
    const { prefix, suffix } = sha1Parts(password);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`00000000000000000000000000000000000:0\r\n${suffix}:42\r\n`),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = new PasswordPolicyService();

    await expect(service.assertAcceptablePassword(password)).rejects.toThrow("Этот пароль найден");
    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ "Add-Padding": "true" }),
      }),
    );
  });

  it("игнорирует padded-записи с count 0", async () => {
    const password = "UniquePass12345";
    const { suffix } = sha1Parts(password);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(`${suffix}:0\r\n`),
      }),
    );

    const service = new PasswordPolicyService();

    await expect(service.assertAcceptablePassword(password)).resolves.toBeUndefined();
  });

  it("не блокирует регистрацию, если внешний API временно недоступен", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
      }),
    );

    const service = new PasswordPolicyService();

    await expect(service.assertAcceptablePassword("UniquePass12345")).resolves.toBeUndefined();
  });

  it("умеет отключать внешнюю проверку через env для тестов и offline-стендов", async () => {
    process.env.PWNED_PASSWORDS_CHECK_ENABLED = "0";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const service = new PasswordPolicyService();

    await expect(service.assertAcceptablePassword("UniquePass12345")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
