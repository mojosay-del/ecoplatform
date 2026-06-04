import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyRole, CompanyStatus, NotificationCategory } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import {
  MIN_PASSWORD_LENGTH,
  type AuthMeUser,
  type LoginDto,
  type RegisterDto,
  type RegistrationVerifyDto,
} from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { swallowAndLog } from "../common/silent-catch";
import { EmailService } from "../email/email.service";
import { recordUserRegistered } from "../observability/metrics.registry";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";
import { loginAuthUser, type AuthLoginWorkflowDeps } from "./auth-login-workflow.helpers";
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

const ACCOUNT_DELETION_GRACE_DAYS = 30;
const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

type AccountDeletionResponse = {
  ok: true;
  deletionRequestedAt: string | null;
  deletionScheduledFor: string | null;
};

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
    if (input.newPassword.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Новый пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов.`);
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

    await this.passwordPolicy.assertAcceptablePassword(input.newPassword);

    const passwordHash = await hash(input.newPassword, 12);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      // Все остальные сессии отзываются — это стандартное требование безопасности.
      await tx.session.updateMany({
        where: { userId, revokedAt: null, NOT: { id: sessionId } },
        data: { revokedAt: new Date() },
      });
    });
    await this.sessionCache.invalidateUser(userId);

    return { ok: true };
  }

  async requestAccountDeletion(userId: string, sessionId: string): Promise<AccountDeletionResponse> {
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            select: { id: true, status: true, statusBeforeDeletion: true },
          },
        },
      });
      if (!user) {
        throw new UnauthorizedException("Пользователь не найден.");
      }

      const deletionRequestedAt = user.deletionRequestedAt ?? now;
      if (!user.deletionRequestedAt) {
        await tx.user.update({
          where: { id: userId },
          data: { deletionRequestedAt },
        });
      }

      // В pending_deletion переводим ВСЮ компанию только когда удаляется её
      // владелец: уход владельца = закрытие компании со всеми сотрудниками
      // (крон-чистка удалит компанию, когда не останется пользователей).
      // Участник (member) удаляет лишь свой аккаунт — компания и доступ
      // остальных сотрудников не страдают; крон вычистит только его user-строку
      // по deletionRequestedAt, оставив компанию работать.
      //
      // На вырост: для multi-user компаний удаление владельца стоит заменить на
      // передачу прав владельца другому сотруднику — иначе уход владельца
      // закрывает доступ всем. Пока в проде компании 1:1, поэтому сохраняем
      // прежнее поведение «владелец ушёл → компания закрывается».
      const isOwner = user.companyRole === CompanyRole.owner;
      if (user.company && isOwner && user.company.status !== CompanyStatus.pending_deletion) {
        await tx.company.update({
          where: { id: user.company.id },
          data: {
            status: CompanyStatus.pending_deletion,
            statusBeforeDeletion: user.company.status,
          },
        });
      }

      await tx.session.updateMany({
        where: { userId, revokedAt: null, NOT: { id: sessionId } },
        data: { revokedAt: now },
      });

      return {
        companyId: user.companyId,
        deletionRequestedAt,
      };
    });

    await this.sessionCache.invalidateUser(userId);

    return serializeAccountDeletion(result.deletionRequestedAt);
  }

  async cancelAccountDeletion(userId: string): Promise<AccountDeletionResponse> {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        include: {
          company: {
            select: { id: true, status: true, statusBeforeDeletion: true },
          },
        },
      });
      if (!user) {
        throw new UnauthorizedException("Пользователь не найден.");
      }

      await tx.user.update({
        where: { id: userId },
        data: { deletionRequestedAt: null },
      });

      if (user.company?.status === CompanyStatus.pending_deletion) {
        const otherPendingUsers = await tx.user.count({
          where: {
            companyId: user.company.id,
            id: { not: userId },
            deletionRequestedAt: { not: null },
          },
        });

        if (otherPendingUsers === 0) {
          await tx.company.update({
            where: { id: user.company.id },
            data: {
              status: user.company.statusBeforeDeletion ?? CompanyStatus.demo,
              statusBeforeDeletion: null,
            },
          });
        }
      }
    });

    await this.sessionCache.invalidateUser(userId);

    return serializeAccountDeletion(null);
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

  async me(userId: string): Promise<AuthMeUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        company: {
          select: {
            id: true,
            organizationName: true,
            type: true,
            status: true,
            demoEndsAt: true,
            subscriptionPlan: true,
            subscriptionEndsAt: true,
          },
        },
        platformStaff: true,
      },
    });

    const platformRoles = user.platformStaff?.isActive ? user.platformStaff.roles : [];

    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      gender: user.gender,
      status: user.status,
      avatarUrl: resolveProfileAvatarUrl(platformRoles, user.company?.type ?? null, user.gender),
      companyId: user.companyId,
      company: user.company
        ? {
            id: user.company.id,
            organizationName: user.company.organizationName,
            type: user.company.type,
            status: user.company.status,
            demoEndsAt: user.company.demoEndsAt?.toISOString() ?? null,
            subscriptionPlan: user.company.subscriptionPlan,
            subscriptionEndsAt: user.company.subscriptionEndsAt?.toISOString() ?? null,
          }
        : null,
      platformRoles,
      requiresReConsent: await this.hasPendingRequiredConsent(userId),
      deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
      deletionScheduledFor: user.deletionRequestedAt
        ? accountDeletionScheduledFor(user.deletionRequestedAt).toISOString()
        : null,
    };
  }

  // requiresReConsent=true означает, что после последнего входа была
  // опубликована новая версия обязательного документа, и пользователь её
  // ещё не подтвердил. UI показывает модалку «Условия использования
  // обновлены» при следующем визите. ConsentRecord имеет уникальный
  // (userId, documentId) — каждая новая версия = новая строка LegalDocument,
  // поэтому отсутствие записи на конкретную активную версию = pending.
  private async hasPendingRequiredConsent(userId: string): Promise<boolean> {
    const requiredActive = await this.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
      select: { id: true },
    });
    if (requiredActive.length === 0) return false;
    const acceptedCount = await this.prisma.consentRecord.count({
      where: { userId, documentId: { in: requiredActive.map((d) => d.id) } },
    });
    return acceptedCount < requiredActive.length;
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
}

function resolveProfileAvatarUrl(platformRoles: string[], companyType: string | null, gender: string): string | null {
  const platformPrefix = platformRoles.includes("admin")
    ? "a"
    : platformRoles.includes("moderator") || platformRoles.includes("content_manager")
      ? "m"
      : null;
  const suffix = avatarSuffixByGender[gender];

  if (platformPrefix && suffix) {
    return `/avatars/platform/${platformPrefix}${suffix}.png`;
  }

  const companyPrefix = companyType ? companyAvatarPrefixByType[companyType] : null;
  if (!companyPrefix || !suffix) return null;

  return `/avatars/company/${companyPrefix}${suffix}.png`;
}

const companyAvatarPrefixByType: Record<string, string> = {
  collector: "z",
  trader: "t",
  processor: "p",
};

const avatarSuffixByGender: Record<string, string> = {
  male: "man",
  female: "woman",
};

function accountDeletionScheduledFor(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

function serializeAccountDeletion(requestedAt: Date | null): AccountDeletionResponse {
  return {
    ok: true,
    deletionRequestedAt: requestedAt?.toISOString() ?? null,
    deletionScheduledFor: requestedAt ? accountDeletionScheduledFor(requestedAt).toISOString() : null,
  };
}
