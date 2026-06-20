import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyRole, CompanyStatus, NotificationCategory } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import {
  type LoginDto,
  type RegisterDto,
  type RegistrationResendDto,
  type RegistrationVerifyDto,
} from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { EmailService } from "../email/email.service";
import { recordUserRegistered } from "../observability/metrics.registry";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { loginAuthUser, type AuthLoginWorkflowDeps } from "./auth-login-workflow.helpers";
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MS,
  emailVerificationCodeMatches,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
} from "./email-verification-code.helpers";
import { changeAuthUserPassword, type AuthPasswordWorkflowDeps } from "./auth-password-workflow.helpers";
import { getAuthMeUser, type AuthProfileDeps } from "./auth-profile.helpers";
import {
  cancelAuthAccountDeletion,
  requestAuthAccountDeletion,
  type AccountDeletionResponse,
  type AuthAccountDeletionDeps,
} from "./auth-account-deletion.helpers";
import {
  createAuthSession,
  listAuthSessions,
  logoutAllAuthSessions,
  logoutAuthSession,
  refreshAuthSession,
  revokeAuthSession,
  type AuthSessionMeta,
  type AuthSessionTokens,
  type AuthSessionWorkflowDeps,
} from "./auth-session-workflow.helpers";
import { PasswordPolicyService } from "./password-policy.service";

type RegistrationVerificationStart = {
  verificationId: string;
  email: string;
  expiresAt: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly settings: PlatformSettingsService,
    private readonly sessionCache: SessionCacheService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly email: EmailService,
  ) {}

  async getRegistrationStatus(): Promise<{ enabled: boolean }> {
    return { enabled: await this.settings.getValue("auth.registration_enabled") };
  }

  async register(
    input: RegisterDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<RegistrationVerificationStart> {
    const prepared = await this.prepareRegistration(input);
    const verificationId = randomUUID();
    const code = generateEmailVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);

    await this.prisma.emailVerificationChallenge.updateMany({
      where: {
        OR: [{ email: prepared.email }, { phone: input.phone }],
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });

    await this.prisma.emailVerificationChallenge.create({
      data: {
        id: verificationId,
        email: prepared.email,
        phone: input.phone,
        organizationName: input.organizationName,
        companyType: input.companyType,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash: prepared.passwordHash,
        acceptedDocumentIds: prepared.consentDocumentIds,
        codeHash: hashEmailVerificationCode(verificationId, prepared.email, code),
        expiresAt,
      },
    });

    await this.sendRegistrationCode({ email: prepared.email, code, expiresAt });

    return { verificationId, email: prepared.email, expiresAt: expiresAt.toISOString() };
  }

  async resendRegistrationCode(input: RegistrationResendDto): Promise<RegistrationVerificationStart> {
    const now = new Date();
    const challenge = await this.prisma.emailVerificationChallenge.findUnique({
      where: { id: input.verificationId },
      select: { id: true, email: true, verifiedAt: true, expiresAt: true },
    });

    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= now) {
      throw new BadRequestException("Код устарел. Отправьте новый код подтверждения.");
    }

    const code = generateEmailVerificationCode();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
    const updated = await this.prisma.emailVerificationChallenge.updateMany({
      where: {
        id: challenge.id,
        verifiedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        codeHash: hashEmailVerificationCode(challenge.id, challenge.email, code),
        attempts: 0,
        expiresAt,
      },
    });

    if (updated.count !== 1) {
      throw new BadRequestException("Код устарел. Отправьте новый код подтверждения.");
    }

    await this.sendRegistrationCode({ email: challenge.email, code, expiresAt });

    return { verificationId: challenge.id, email: challenge.email, expiresAt: expiresAt.toISOString() };
  }

  private async sendRegistrationCode(input: { email: string; code: string; expiresAt: Date }): Promise<void> {
    await this.email.sendRegistrationCode({ to: input.email, code: input.code, expiresAt: input.expiresAt });
  }

  async verifyRegistration(
    input: RegistrationVerifyDto,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthSessionTokens> {
    const now = new Date();
    const challenge = await this.prisma.emailVerificationChallenge.findUnique({
      where: { id: input.verificationId },
    });

    if (!challenge || challenge.verifiedAt || challenge.expiresAt <= now) {
      throw new BadRequestException("Код устарел. Отправьте новый код подтверждения.");
    }

    if (challenge.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new BadRequestException("Слишком много попыток. Отправьте новый код подтверждения.");
    }

    if (!emailVerificationCodeMatches(challenge.id, challenge.email, input.code, challenge.codeHash)) {
      const nextAttempts = challenge.attempts + 1;
      const tooManyAttempts = nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS;
      await this.prisma.emailVerificationChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          ...(tooManyAttempts ? { expiresAt: now } : {}),
        },
      });
      throw new BadRequestException(
        tooManyAttempts ? "Слишком много попыток. Отправьте новый код подтверждения." : "Неверный код подтверждения.",
      );
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: challenge.email }, { phone: challenge.phone }],
      },
    });

    if (existing) {
      throw new ConflictException("Пользователь с такой почтой или телефоном уже зарегистрирован.");
    }

    const consentDocumentIds = await this.resolveRegistrationConsentDocumentIds(challenge.acceptedDocumentIds);
    // После подтверждения почты компания создаётся без активного trial.
    // Web сразу открывает продукт и показывает обязательный выбор доступа:
    // пробный доступ на demo.duration_hours или тестовую paid-подписку.
    const userId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.emailVerificationChallenge.updateMany({
        where: {
          id: challenge.id,
          verifiedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { verifiedAt: new Date() },
      });

      if (claimed.count !== 1) {
        throw new BadRequestException("Код устарел. Отправьте новый код подтверждения.");
      }

      const company = await tx.company.create({
        data: {
          organizationName: challenge.organizationName,
          type: challenge.companyType,
          status: CompanyStatus.demo,
          demoEndsAt: null,
        },
      });

      const user = await tx.user.create({
        data: {
          email: challenge.email,
          phone: challenge.phone,
          firstName: challenge.firstName,
          lastName: challenge.lastName,
          passwordHash: challenge.passwordHash,
          companyId: company.id,
          // Создатель компании при регистрации — её владелец. Приглашённые
          // сотрудники будут привязываться с ролью member.
          companyRole: CompanyRole.owner,
        },
      });

      if (consentDocumentIds.length) {
        await tx.consentRecord.createMany({
          data: consentDocumentIds.map((documentId) => ({
            userId: user.id,
            documentId,
            source: "registration" as const,
            ipAddress: meta.ipAddress ?? null,
            userAgent: meta.userAgent ?? null,
          })),
          skipDuplicates: true,
        });
      }

      return user.id;
    });

    const tokens = await this.createSession(userId, meta, false);
    recordUserRegistered();
    return tokens;
  }

  private async prepareRegistration(input: RegisterDto): Promise<{
    email: string;
    passwordHash: string;
    consentDocumentIds: string[];
  }> {
    // Тумблер из админки (Настройки → Регистрация). Когда выключен — само-
    // регистрация закрыта (например, на время доработки MVP). Существующих
    // пользователей и вход это не затрагивает.
    const registrationEnabled = await this.settings.getValue("auth.registration_enabled");
    if (!registrationEnabled) {
      throw new ForbiddenException("Регистрация новых пользователей временно отключена.");
    }

    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: input.email.toLowerCase() }, { phone: input.phone }],
      },
    });

    if (existing) {
      throw new ConflictException("Пользователь с такой почтой или телефоном уже зарегистрирован.");
    }

    await this.passwordPolicy.assertAcceptablePassword(input.password);
    const passwordHash = await hash(input.password, 12);

    return {
      email: input.email.toLowerCase(),
      passwordHash,
      consentDocumentIds: await this.resolveRegistrationConsentDocumentIds(input.acceptedDocumentIds),
    };
  }

  private async resolveRegistrationConsentDocumentIds(acceptedDocumentIds: string[]): Promise<string[]> {
    // Проверка обязательных юр-документов до создания компании/юзера, чтобы
    // не оставлять «мусорный» аккаунт без consent'а, если массив неполный.
    // Если в системе вообще нет активных обязательных документов (свежий
    // dev-стенд до сидера), регистрация всё равно проходит — пустой
    // requiredActive не блокирует. На проде сидер запускается до запуска.
    const requiredActive = await this.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
      select: { id: true, title: true },
    });
    const proposed = new Set(acceptedDocumentIds);
    const missingRequired = requiredActive.filter((d) => !proposed.has(d.id));
    if (missingRequired.length) {
      throw new BadRequestException(
        "Не подтверждены обязательные документы: " + missingRequired.map((d) => d.title).join(", "),
      );
    }
    // Опциональные документы (cookies, marketing): берём только активные из
    // присланных, остальные молча игнорируем — устаревшие версии или
    // несуществующие ID не должны валить регистрацию.
    const optionalAcceptedActive = acceptedDocumentIds.length
      ? await this.prisma.legalDocument.findMany({
          where: { isActive: true, id: { in: acceptedDocumentIds } },
          select: { id: true },
        })
      : [];
    return Array.from(new Set(optionalAcceptedActive.map((d) => d.id)));
  }

  async login(input: LoginDto, meta: { userAgent?: string; ipAddress?: string }): Promise<AuthSessionTokens> {
    return loginAuthUser(this.loginWorkflowDeps, input, meta);
  }

  async changePassword(
    userId: string,
    sessionId: string,
    input: { currentPassword: string; newPassword: string },
  ): Promise<{ ok: true }> {
    return changeAuthUserPassword(this.passwordWorkflowDeps, userId, sessionId, input);
  }

  async requestAccountDeletion(userId: string, sessionId: string): Promise<AccountDeletionResponse> {
    return requestAuthAccountDeletion(this.accountDeletionDeps, userId, sessionId);
  }

  async cancelAccountDeletion(userId: string): Promise<AccountDeletionResponse> {
    return cancelAuthAccountDeletion(this.accountDeletionDeps, userId);
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSessionTokens> {
    return refreshAuthSession(this.sessionWorkflowDeps, refreshToken);
  }

  async logout(sessionId: string): Promise<{ ok: true }> {
    return logoutAuthSession(this.sessionWorkflowDeps, sessionId);
  }

  async listSessions(userId: string, currentSessionId: string) {
    return listAuthSessions(this.sessionWorkflowDeps, userId, currentSessionId);
  }

  async revokeSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ): Promise<{ ok: true; revokedCurrent: boolean }> {
    return revokeAuthSession(this.sessionWorkflowDeps, userId, currentSessionId, sessionId);
  }

  async logoutAllSessions(userId: string): Promise<{ ok: true; revoked: number }> {
    return logoutAllAuthSessions(this.sessionWorkflowDeps, userId);
  }

  async me(userId: string) {
    return getAuthMeUser(this.profileDeps, userId);
  }

  private async createSession(userId: string, meta: AuthSessionMeta, rememberMe: boolean): Promise<AuthSessionTokens> {
    return createAuthSession(this.sessionWorkflowDeps, userId, meta, rememberMe);
  }

  private get loginWorkflowDeps(): AuthLoginWorkflowDeps {
    return {
      prisma: this.prisma,
      settings: this.settings,
      createSession: (userId, meta, rememberMe) => this.createSession(userId, meta, rememberMe),
    };
  }

  private get sessionWorkflowDeps(): AuthSessionWorkflowDeps {
    return {
      prisma: this.prisma,
      jwt: this.jwt,
      sessionCache: this.sessionCache,
    };
  }

  private get passwordWorkflowDeps(): AuthPasswordWorkflowDeps {
    return {
      prisma: this.prisma,
      passwordPolicy: this.passwordPolicy,
      sessionCache: this.sessionCache,
    };
  }

  private get accountDeletionDeps(): AuthAccountDeletionDeps {
    return {
      prisma: this.prisma,
      sessionCache: this.sessionCache,
    };
  }

  private get profileDeps(): AuthProfileDeps {
    return {
      prisma: this.prisma,
      settings: this.settings,
    };
  }
}
