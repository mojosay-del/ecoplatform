import { ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailService } from "./email.service";

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(),
  },
}));

const ORIGINAL_ENV = { ...process.env };

function setSmtpEnv() {
  process.env.NODE_ENV = "development";
  delete process.env.EMAIL_DELIVERY_DISABLED;
  process.env.SMTP_HOST = "smtp.example.test";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_SECURE = "1";
  process.env.SMTP_USER = "notify@example.test";
  process.env.SMTP_PASS = "secret";
  process.env.SMTP_FROM = "ЭкоПлатформа <notify@example.test>";
}

describe("EmailService", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    setSmtpEnv();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
  });

  it("настраивает короткие SMTP-таймауты для отправки регистрационного кода", async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: "message-1" });
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const service = new EmailService();

    await service.sendRegistrationCode({
      to: "user@example.test",
      code: "1234",
      expiresAt: new Date("2026-05-31T20:30:00.000Z"),
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.test",
        port: 465,
        secure: true,
        connectionTimeout: 8_000,
        greetingTimeout: 5_000,
        socketTimeout: 8_000,
        dnsTimeout: 5_000,
      }),
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "ЭкоПлатформа <notify@example.test>",
        to: "user@example.test",
        subject: "Код подтверждения ЭкоПлатформы",
      }),
    );
  });

  it("возвращает понятную 503-ошибку, если SMTP не ответил вовремя", async () => {
    const sendMail = vi.fn().mockRejectedValue(Object.assign(new Error("Connection timeout"), { code: "ETIMEDOUT" }));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);

    const service = new EmailService();

    await expect(
      service.sendRegistrationCode({
        to: "user@example.test",
        code: "1234",
        expiresAt: new Date("2026-05-31T20:30:00.000Z"),
      }),
    ).rejects.toThrow("Не удалось отправить код подтверждения");
  });

  it("обрывает всю SMTP-операцию по общему таймауту", async () => {
    vi.useFakeTimers();
    process.env.SMTP_SEND_TIMEOUT_MS = "25";
    const close = vi.fn();
    const sendMail = vi.fn(() => new Promise(() => undefined));
    vi.mocked(nodemailer.createTransport).mockReturnValue({ close, sendMail } as never);

    const service = new EmailService();
    const sendPromise = service.sendRegistrationCode({
      to: "user@example.test",
      code: "1234",
      expiresAt: new Date("2026-05-31T20:30:00.000Z"),
    });
    const rejection = expect(sendPromise).rejects.toThrow(ServiceUnavailableException);

    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("показывает неверные SMTP-таймауты в health-конфиге", () => {
    process.env.SMTP_CONNECTION_TIMEOUT_MS = "0";
    process.env.SMTP_SOCKET_TIMEOUT_MS = "abc";

    expect(new EmailService().getHealthConfig()).toEqual(
      expect.objectContaining({
        configured: false,
        invalid: ["SMTP_CONNECTION_TIMEOUT_MS", "SMTP_SOCKET_TIMEOUT_MS"],
      }),
    );
  });
});
