import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";

type RegistrationCodeEmail = {
  to: string;
  code: string;
  expiresAt: Date;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  connectionTimeoutMs: number;
  greetingTimeoutMs: number;
  socketTimeoutMs: number;
  dnsTimeoutMs: number;
  sendTimeoutMs: number;
};

type EmailHealthConfig = {
  configured: boolean;
  deliveryDisabled: boolean;
  missing: string[];
  invalid: string[];
  host: string | null;
};

const SMTP_CONNECTION_TIMEOUT_MS = 8_000;
const SMTP_GREETING_TIMEOUT_MS = 5_000;
const SMTP_SOCKET_TIMEOUT_MS = 8_000;
const SMTP_DNS_TIMEOUT_MS = 5_000;
const SMTP_SEND_TIMEOUT_MS = 10_000;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  async sendRegistrationCode(input: RegistrationCodeEmail): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const config = this.smtpConfig();
    const transporter = this.getTransporter(config);
    const expiresAt = input.expiresAt.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    });

    try {
      await this.sendMailWithTimeout(transporter, config.sendTimeoutMs, {
        from: config.from,
        to: input.to,
        subject: "Код подтверждения ЭкоПлатформы",
        text: [
          `Ваш код подтверждения: ${input.code}`,
          `Код действует до ${expiresAt} по Москве.`,
          "Если вы не регистрировались на ЭкоПлатформе, просто проигнорируйте это письмо.",
        ].join("\n"),
        html: [
          "<p>Ваш код подтверждения:</p>",
          `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${input.code}</p>`,
          `<p>Код действует до ${expiresAt} по Москве.</p>`,
          "<p>Если вы не регистрировались на ЭкоПлатформе, просто проигнорируйте это письмо.</p>",
        ].join(""),
      });
    } catch (error) {
      this.logger.warn(`SMTP registration email failed: ${smtpErrorCode(error)}`);
      throw new ServiceUnavailableException("Не удалось отправить код подтверждения. Попробуйте ещё раз через минуту.");
    }
  }

  private getTransporter(config: SmtpConfig): Transporter {
    if (this.transporter) return this.transporter;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      connectionTimeout: config.connectionTimeoutMs,
      greetingTimeout: config.greetingTimeoutMs,
      socketTimeout: config.socketTimeoutMs,
      dnsTimeout: config.dnsTimeoutMs,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    return this.transporter;
  }

  private async sendMailWithTimeout(transporter: Transporter, timeoutMs: number, mail: SendMailOptions): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;

    try {
      await Promise.race([
        transporter.sendMail(mail),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            timedOut = true;
            reject(new Error("SMTP_SEND_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (timedOut) {
        transporter.close();
        if (this.transporter === transporter) {
          this.transporter = null;
        }
      }
    }
  }

  getHealthConfig(): EmailHealthConfig {
    const rawPort = process.env.SMTP_PORT ?? "465";
    const port = Number(rawPort);
    const requiredEnv: Array<[string, string | undefined]> = [
      ["SMTP_HOST", process.env.SMTP_HOST],
      ["SMTP_USER", process.env.SMTP_USER],
      ["SMTP_PASS", process.env.SMTP_PASS],
    ];
    const missing = requiredEnv.filter(([, value]) => !value).map(([name]) => name);
    const invalid = Number.isInteger(port) && port > 0 ? [] : ["SMTP_PORT"];
    const deliveryDisabled = process.env.EMAIL_DELIVERY_DISABLED === "1";
    for (const [name, fallback] of smtpTimeoutEnvKeys()) {
      if (!validPositiveIntegerEnv(name, fallback)) {
        invalid.push(name);
      }
    }

    return {
      configured: !deliveryDisabled && missing.length === 0 && invalid.length === 0,
      deliveryDisabled,
      missing,
      invalid,
      host: process.env.SMTP_HOST ?? null,
    };
  }

  private smtpConfig(): SmtpConfig {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const rawPort = process.env.SMTP_PORT ?? "465";
    const port = Number(rawPort);

    if (!host || !user || !pass || !Number.isInteger(port) || port <= 0) {
      throw new ServiceUnavailableException("Отправка почты пока не настроена. Попробуйте позже.");
    }

    return {
      host,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "1" : port === 465,
      user,
      pass,
      from: process.env.SMTP_FROM || `ЭкоПлатформа <${user}>`,
      connectionTimeoutMs: readPositiveIntegerEnv("SMTP_CONNECTION_TIMEOUT_MS", SMTP_CONNECTION_TIMEOUT_MS),
      greetingTimeoutMs: readPositiveIntegerEnv("SMTP_GREETING_TIMEOUT_MS", SMTP_GREETING_TIMEOUT_MS),
      socketTimeoutMs: readPositiveIntegerEnv("SMTP_SOCKET_TIMEOUT_MS", SMTP_SOCKET_TIMEOUT_MS),
      dnsTimeoutMs: readPositiveIntegerEnv("SMTP_DNS_TIMEOUT_MS", SMTP_DNS_TIMEOUT_MS),
      sendTimeoutMs: readPositiveIntegerEnv("SMTP_SEND_TIMEOUT_MS", SMTP_SEND_TIMEOUT_MS),
    };
  }

  private deliveryDisabled(): boolean {
    if (process.env.NODE_ENV === "test") return true;
    if (process.env.EMAIL_DELIVERY_DISABLED !== "1") return false;
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException("Отправка почты отключена в production-окружении.");
    }
    return true;
  }
}

function smtpTimeoutEnvKeys(): Array<[string, number]> {
  return [
    ["SMTP_CONNECTION_TIMEOUT_MS", SMTP_CONNECTION_TIMEOUT_MS],
    ["SMTP_GREETING_TIMEOUT_MS", SMTP_GREETING_TIMEOUT_MS],
    ["SMTP_SOCKET_TIMEOUT_MS", SMTP_SOCKET_TIMEOUT_MS],
    ["SMTP_DNS_TIMEOUT_MS", SMTP_DNS_TIMEOUT_MS],
    ["SMTP_SEND_TIMEOUT_MS", SMTP_SEND_TIMEOUT_MS],
  ];
}

function readPositiveIntegerEnv(name: string, fallback: number): number {
  return validPositiveIntegerEnv(name, fallback) ? Number(process.env[name] ?? fallback) : fallback;
}

function validPositiveIntegerEnv(name: string, fallback: number): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return Number.isInteger(fallback) && fallback > 0;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0;
}

function smtpErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    return String((error as { code?: unknown }).code ?? "unknown");
  }
  return "unknown";
}
