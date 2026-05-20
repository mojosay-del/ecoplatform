import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyStatus, UserStatus } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import type { LoginDto, RegisterDto } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
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

    return this.createSession(user.id, meta, Boolean(input.rememberMe));
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
