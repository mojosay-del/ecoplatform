import { BadRequestException, ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyRole, CompanyStatus, NotificationCategory } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { type LoginDto, type RegisterDto, type RegistrationVerifyDto } from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { swallowAndLog } from "../common/silent-catch";
import { EmailService } from "../email/email.service";
import { recordUserRegistered } from "../observability/metrics.registry";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { loginAuthUser, type AuthLoginWorkflowDeps } from "./auth-login-workflow.helpers";
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

const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

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
    const code = this.generateEmailVerificationCode();
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
        gender: input.gender,
        passwordHash: prepared.passwordHash,
        acceptedDocumentIds: prepared.consentDocumentIds,
        codeHash: this.hashEmailVerificationCode(verificationId, prepared.email, code),
        expiresAt,
      },
    });

    this.sendRegistrationCodeInBackground({ verificationId, email: prepared.email, code, expiresAt });

    return { verificationId, email: prepared.email, expiresAt: expiresAt.toISOString() };
  }

  private sendRegistrationCodeInBackground(input: {
    verificationId: string;
    email: string;
    code: string;
    expiresAt: Date;
  }): void {
    void this.email
      .sendRegistrationCode({ to: input.email, code: input.code, expiresAt: input.expiresAt })
      .catch(swallowAndLog("auth.registration.email.background", { verificationId: input.verificationId }));
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

    if (!this.emailVerificationCodeMatches(challenge.id, challenge.email, input.code, challenge.codeHash)) {
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
    // Демо-доступ управляется из админки. Когда выдача демо выключена, компания
    // регистрируется с уже истёкшим демо (demoEndsAt = «сейчас»): кабинет
    // доступен, но платные разделы закрыты до ручной активации подписки.
    // Существующий access.ts уже трактует demo с прошедшим demoEndsAt как
    // «демо закончилось», поэтому новый статус заводить не нужно.
    const demoEnabled = await this.settings.getValue("demo.enabled");
    const demoHours = await this.settings.getValue("demo.duration_hours");
    const demoEndsAt = demoEnabled ? new Date(Date.now() + demoHours * 60 * 60 * 1000) : new Date();
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
          demoEndsAt,
        },
      });

      const user = await tx.user.create({
        data: {
          email: challenge.email,
          phone: challenge.phone,
          firstName: challenge.firstName,
          lastName: challenge.lastName,
          gender: challenge.gender,
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

  private generateEmailVerificationCode(): string {
    const fixedCode = process.env.EMAIL_VERIFICATION_TEST_CODE;
    if (fixedCode && process.env.NODE_ENV !== "production") {
      if (!/^\d{4}$/.test(fixedCode)) {
        throw new Error("EMAIL_VERIFICATION_TEST_CODE должен состоять из 4 цифр.");
      }
      return fixedCode;
    }
    if (fixedCode && process.env.NODE_ENV === "production") {
      throw new Error("EMAIL_VERIFICATION_TEST_CODE нельзя использовать в production.");
    }
    return randomInt(0, 10_000).toString().padStart(4, "0");
  }

  private hashEmailVerificationCode(verificationId: string, email: string, code: string): string {
    return createHmac("sha256", this.emailVerificationSecret())
      .update(`${verificationId}:${email}:${code}`)
      .digest("hex");
  }

  private emailVerificationCodeMatches(
    verificationId: string,
    email: string,
    code: string,
    storedHash: string,
  ): boolean {
    const expectedHash = this.hashEmailVerificationCode(verificationId, email, code);
    const expected = Buffer.from(expectedHash, "hex");
    const actual = Buffer.from(storedHash, "hex");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private emailVerificationSecret(): string {
    const secret = process.env.EMAIL_VERIFICATION_SECRET ?? process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error("EMAIL_VERIFICATION_SECRET или JWT_ACCESS_SECRET должен быть не короче 32 символов.");
    }
    return secret;
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
    };
  }
}
