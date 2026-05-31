import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

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
};

@Injectable()
export class EmailService {
  private transporter: Transporter | null = null;

  async sendRegistrationCode(input: RegistrationCodeEmail): Promise<void> {
    if (this.deliveryDisabled()) {
      return;
    }

    const transporter = this.getTransporter();
    const expiresAt = input.expiresAt.toLocaleTimeString("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Moscow",
    });

    await transporter.sendMail({
      from: this.smtpConfig().from,
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
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const config = this.smtpConfig();
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.user,
        pass: config.pass,
      },
    });
    return this.transporter;
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
