import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import type { SendMailOptions, Transporter } from "nodemailer";

type RegistrationCodeEmail = {
  to: string;
  code: string;
  expiresAt: Date;
};

type AccountContactChangeCodeEmail = RegistrationCodeEmail & {
  field: "email" | "phone";
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
    await this.sendVerificationCode({
      ...input,
      subject: "Код подтверждения ЭкоПлатформы",
      actionText: "Ваш код подтверждения:",
      ignoreText: "Если вы не регистрировались на ЭкоПлатформе, просто проигнорируйте это письмо.",
      warnContext: "registration",
    });
  }

  async sendAccountContactChangeCode(input: AccountContactChangeCodeEmail): Promise<void> {
    const fieldLabel = input.field === "email" ? "email" : "телефона";
    await this.sendVerificationCode({
      ...input,
      subject: "Код подтверждения изменения профиля",
      actionText: `Ваш код для изменения ${fieldLabel}:`,
      ignoreText:
        "Если вы не запрашивали изменение — не сообщайте код никому, завершите все сессии и смените пароль в личном кабинете.",
      warnContext: "account contact change",
    });
  }

  // Алерт о смене пароля: уходит владельцу аккаунта после успешной смены.
  // Best-effort — вызывающий код проглатывает ошибку, смена пароля уже применена.
  async sendPasswordChangedAlert(input: { to: string }): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const config = this.smtpConfig();
    const transporter = this.getTransporter(config);
    const lines = [
      "Пароль на вашем аккаунте ЭкоПлатформы изменён.",
      "Если это были вы — никаких действий не требуется, остальные сессии уже завершены.",
      "Если это были не вы — срочно завершите все сессии и смените пароль.",
    ];

    try {
      await this.sendMailWithTimeout(transporter, config.sendTimeoutMs, {
        from: config.from,
        to: input.to,
        subject: "Пароль аккаунта изменён",
        text: lines.join("\n"),
        html: lines.map((line) => `<p>${line}</p>`).join(""),
      });
    } catch (error) {
      // Алерт — best-effort: пароль уже сменён, падать на письме нельзя.
      this.logger.warn(`SMTP password-changed alert failed: ${smtpErrorCode(error)}`);
    }
  }

  // M-9: код на НОВЫЙ email — подтверждение владения новым адресом (вторая
  // сторона двусторонней верификации). Уходит на новый адрес, а не на текущий.
  async sendNewEmailVerificationCode(input: RegistrationCodeEmail): Promise<void> {
    await this.sendVerificationCode({
      ...input,
      subject: "Подтвердите новый email на ЭкоПлатформе",
      actionText: "Код для подтверждения нового адреса:",
      ignoreText:
        "Если вы не указывали этот адрес для своего аккаунта на ЭкоПлатформе, просто проигнорируйте это письмо.",
      warnContext: "account new-email verification",
    });
  }

  // M-9: алерт на СТАРЫЙ адрес о том, что контакт изменён. Информирует владельца
  // прежнего адреса о смене (раннее обнаружение несанкционированного изменения).
  async sendContactChangeAlert(input: { to: string; field: "email" | "phone" }): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const fieldLabel = input.field === "email" ? "email" : "телефон";
    const config = this.smtpConfig();
    const transporter = this.getTransporter(config);
    const lines = [
      `На вашем аккаунте ЭкоПлатформы изменён ${fieldLabel}.`,
      "Если это были вы — никаких действий не требуется.",
      "Если это были не вы — срочно восстановите доступ и смените пароль.",
    ];

    try {
      await this.sendMailWithTimeout(transporter, config.sendTimeoutMs, {
        from: config.from,
        to: input.to,
        subject: "Контактные данные аккаунта изменены",
        text: lines.join("\n"),
        html: lines.map((line) => `<p>${line}</p>`).join(""),
      });
    } catch (error) {
      // Алерт — best-effort: смена контакта уже применена, падать на письме нельзя.
      this.logger.warn(`SMTP contact-change alert failed: ${smtpErrorCode(error)}`);
    }
  }

  // L-6: уведомление на ЗАНЯТЫЙ адрес, когда кто-то пытается зарегистрироваться
  // с уже существующим email/телефоном. Сама заявка отвечает одинаково (анти-
  // enumeration), поэтому занятость контакта раскрывается только владельцу
  // адреса — письмом, а не HTTP-ответом. SMTP-сбой бросает ту же ошибку, что и
  // код подтверждения, чтобы ответ на заявку не отличался по поведению.
  async sendExistingAccountNotice(input: { to: string }): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const config = this.smtpConfig();
    const transporter = this.getTransporter(config);
    const lines = [
      "Кто-то попытался зарегистрироваться на ЭкоПлатформе, указав ваш email или телефон.",
      "Если это были вы — у вас уже есть аккаунт. Войдите или восстановите пароль.",
      "Если это были не вы — никаких действий не требуется, ваш аккаунт в безопасности.",
    ];

    try {
      await this.sendMailWithTimeout(transporter, config.sendTimeoutMs, {
        from: config.from,
        to: input.to,
        subject: "Попытка регистрации с вашими данными",
        text: lines.join("\n"),
        html: lines.map((line) => `<p>${line}</p>`).join(""),
      });
    } catch (error) {
      this.logger.warn(`SMTP existing-account notice failed: ${smtpErrorCode(error)}`);
      throw new ServiceUnavailableException("Не удалось отправить код подтверждения. Попробуйте ещё раз через минуту.");
    }
  }

  // Приглашение сотрудника в компанию: ссылка с токеном на страницу принятия.
  async sendCompanyInvitation(input: {
    to: string;
    companyName: string;
    inviterName: string;
    acceptUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const config = this.smtpConfig();
    const transporter = this.getTransporter(config);
    const expiresAt = input.expiresAt.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "long",
      timeZone: "Europe/Moscow",
    });
    const intro = `${input.inviterName} приглашает вас в компанию «${input.companyName}» на ЭкоПлатформе.`;
    const lines = [
      intro,
      `Чтобы принять приглашение и создать аккаунт, перейдите по ссылке: ${input.acceptUrl}`,
      `Ссылка действует до ${expiresAt}.`,
      "Если вы не ожидали этого приглашения, просто проигнорируйте письмо.",
    ];

    try {
      await this.sendMailWithTimeout(transporter, config.sendTimeoutMs, {
        from: config.from,
        to: input.to,
        subject: `Приглашение в компанию «${input.companyName}» на ЭкоПлатформе`,
        text: lines.join("\n"),
        html: [
          `<p>${intro}</p>`,
          `<p><a href="${input.acceptUrl}">Принять приглашение</a></p>`,
          `<p>Ссылка действует до ${expiresAt}.</p>`,
          `<p>Если вы не ожидали этого приглашения, просто проигнорируйте письмо.</p>`,
        ].join(""),
      });
    } catch (error) {
      this.logger.warn(`SMTP company invitation failed: ${smtpErrorCode(error)}`);
      throw new ServiceUnavailableException("Не удалось отправить приглашение. Попробуйте ещё раз через минуту.");
    }
  }

  private async sendVerificationCode(
    input: RegistrationCodeEmail & {
      subject: string;
      actionText: string;
      ignoreText: string;
      warnContext: string;
    },
  ): Promise<void> {
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
        subject: input.subject,
        text: [`${input.actionText} ${input.code}`, `Код действует до ${expiresAt} по Москве.`, input.ignoreText].join(
          "\n",
        ),
        html: [
          `<p>${input.actionText}</p>`,
          `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${input.code}</p>`,
          `<p>Код действует до ${expiresAt} по Москве.</p>`,
          `<p>${input.ignoreText}</p>`,
        ].join(""),
      });
    } catch (error) {
      this.logger.warn(`SMTP ${input.warnContext} email failed: ${smtpErrorCode(error)}`);
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
