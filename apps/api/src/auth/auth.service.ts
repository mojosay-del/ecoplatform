import { BadRequestException, ConflictException, forwardRef, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyStatus, NotificationCategory, UserStatus } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import type { LoginDto, RegisterDto } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly settings: PlatformSettingsService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notifications: NotificationsService,
  ) {}

  async register(input: RegisterDto, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionTokens> {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email.toLowerCase() }, { phone: input.phone }],
      },
    });

    if (existing) {
      throw new ConflictException("Пользователь с такой почтой или телефоном уже зарегистрирован.");
    }

    const passwordHash = await hash(input.password, 12);
    const demoHours = await this.settings.getValue("demo.duration_hours");
    const company = await this.prisma.company.create({
      data: {
        organizationName: input.organizationName,
        status: CompanyStatus.demo,
        demoEndsAt: new Date(Date.now() + demoHours * 60 * 60 * 1000),
      },
    });

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        companyId: company.id,
      },
    });

    return this.createSession(user.id, meta, false);
  }

  async login(input: LoginDto, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { company: true },
    });

    if (!user || !(await compare(input.password, user.passwordHash))) {
      throw new UnauthorizedException("Неверный email или пароль.");
    }

    if (user.status === UserStatus.blocked) {
      throw new UnauthorizedException("Учётная запись заблокирована.");
    }

    if (user.company?.status === "blocked" || user.company?.status === "archived") {
      throw new UnauthorizedException("Доступ к кабинету компании закрыт.");
    }

    const newDevice = await this.detectNewDevice(user.id, meta);
    const tokens = await this.createSession(user.id, meta, Boolean(input.rememberMe));
    await this.notifyLogin(user.id, meta, newDevice).catch(() => undefined);

    return tokens;
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ ok: true }> {
    if (input.newPassword.length < 10) {
      throw new BadRequestException("Новый пароль должен содержать не менее 10 символов.");
    }
    if (input.newPassword === input.currentPassword) {
      throw new BadRequestException("Новый пароль должен отличаться от текущего.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Пользователь не найден.");
    }

    const ok = await compare(input.currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException("Текущий пароль указан неверно.");
    }

    const passwordHash = await hash(input.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Все остальные сессии отзываются — это стандартное требование безопасности.
      await tx.session.updateMany({
        where: { userId, revokedAt: null, NOT: { id: sessionId } },
        data: { revokedAt: new Date() },
      });
    });

    await this.notifications
      .createInApp({
        userId,
        eventType: "auth.password_changed",
        sourceId: `${userId}:${Date.now()}`,
        category: NotificationCategory.security,
        title: "Пароль изменён",
        body: "Пароль вашей учётной записи был изменён. Все остальные сессии отозваны.",
        link: "/account",
      })
      .catch(() => undefined);

    return { ok: true };
  }

  private async detectNewDevice(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<boolean> {
    const previous = await this.prisma.session.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    if (!previous) return false;

    const sameUa = (previous.userAgent ?? null) === (meta.userAgent ?? null);
    const sameIp = (previous.ipAddress ?? null) === (meta.ipAddress ?? null);
    return !(sameUa && sameIp);
  }

  private async notifyLogin(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
    newDevice: boolean,
  ): Promise<void> {
    const when = new Date();
    const stamp = when.toISOString();
    const where = [meta.ipAddress ?? "—", meta.userAgent ?? "—"].join(" · ");

    await this.notifications.createInApp({
      userId,
      eventType: newDevice ? "auth.login.new_device" : "auth.login",
      sourceId: `${userId}:${stamp}`,
      category: NotificationCategory.security,
      title: newDevice ? "Вход с нового устройства" : "Новый вход в аккаунт",
      body: newDevice
        ? `Зафиксирован вход с устройства, отличного от предыдущего: ${where}.`
        : `Вход в аккаунт выполнен ${when.toLocaleString("ru-RU")}.`,
      link: "/account",
      payload: { ipAddress: meta.ipAddress ?? null, userAgent: meta.userAgent ?? null, newDevice },
    });
  }

  async refresh(refreshToken: string | undefined): Promise<SessionTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token отсутствует.");
    }

    const sessions = await this.prisma.session.findMany({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    for (const session of sessions) {
      if (await compare(refreshToken, session.refreshTokenHash)) {
        await this.prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });

        return this.createSession(session.userId, {}, session.rememberMe);
      }
    }

    throw new UnauthorizedException("Refresh token недействителен.");
  }

  async logout(sessionId: string): Promise<{ ok: true }> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        company: true,
        platformStaff: true,
      },
    });

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      company: user.company,
      platformRoles: user.platformStaff?.roles ?? [],
    };
  }

  private async createSession(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
    rememberMe: boolean,
  ): Promise<SessionTokens> {
    const refreshToken = randomBytes(48).toString("base64url");
    const refreshTokenHash = await hash(refreshToken, 12);
    const expiresAt = new Date(Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        rememberMe,
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sessionId: session.id },
      {
        secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
        expiresIn: "15m",
      },
    );

    return { accessToken, refreshToken };
  }
}
