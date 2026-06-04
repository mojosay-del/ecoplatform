import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { CompanyRole, CompanyStatus, NotificationCategory, UserStatus } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "crypto";
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
import { PasswordPolicyService } from "./password-policy.service";

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
};

// Реальный bcrypt-compare должен выполняться и для неизвестного email,
// иначе login выдаёт существование пользователя через заметно более быстрый ответ.
const LOGIN_DUMMY_PASSWORD_HASH = "$2a$12$abcdefghijklmnopqrstuv.WkOaBPyDV7c9o6XhOuLNS8tIeS5wXa";
const ACCOUNT_DELETION_GRACE_DAYS = 30;
const EMAIL_VERIFICATION_TTL_MS = 15 * 60 * 1000;
const EMAIL_VERIFICATION_MAX_ATTEMPTS = 5;

type LoginLockoutState = {
  id: string;
  failedLoginAttempts: number;
  failedLoginWindowStartedAt: Date | null;
  lockedUntil: Date | null;
};

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
  ): Promise<SessionTokens> {
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

  async login(input: LoginDto, meta: { userAgent?: string; ipAddress?: string }): Promise<SessionTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      include: { company: true },
    });
    const passwordMatches = await compare(input.password, user?.passwordHash ?? LOGIN_DUMMY_PASSWORD_HASH);

    if (user && this.isLoginLocked(user)) {
      throw new UnauthorizedException(this.loginLockoutMessage(user.lockedUntil));
    }

    if (!user || !passwordMatches) {
      if (user) {
        const lockedUntil = await this.recordFailedLogin(user);
        if (lockedUntil) {
          throw new UnauthorizedException(this.loginLockoutMessage(lockedUntil));
        }
      }
      throw new UnauthorizedException("Неверный email или пароль.");
    }

    if (user.status === UserStatus.blocked) {
      throw new UnauthorizedException("Учётная запись заблокирована.");
    }

    if (user.company?.status === "blocked" || user.company?.status === "archived") {
      throw new UnauthorizedException("Доступ к кабинету компании закрыт.");
    }

    await this.resetFailedLoginState(user);

    return this.createSession(user.id, meta, Boolean(input.rememberMe));
  }

  private isLoginLocked(user: LoginLockoutState): boolean {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
  }

  private loginLockoutMessage(lockedUntil: Date | null): string {
    const remainingMs = Math.max((lockedUntil?.getTime() ?? Date.now()) - Date.now(), 1);
    const remainingMinutes = Math.max(1, Math.ceil(remainingMs / 60_000));
    return `Учётная запись временно заблокирована за слишком много попыток. Попробуйте через ${remainingMinutes} минут.`;
  }

  private async recordFailedLogin(user: LoginLockoutState): Promise<Date | null> {
    const now = new Date();
    // Параметры блокировки управляются из админки (Настройки → Безопасность).
    const [threshold, windowMinutes, durationMinutes] = await Promise.all([
      this.settings.getValue("security.login_lockout_threshold"),
      this.settings.getValue("security.login_lockout_window_minutes"),
      this.settings.getValue("security.login_lockout_duration_minutes"),
    ]);
    const windowStartedAt = user.failedLoginWindowStartedAt;
    const withinWindow = Boolean(
      windowStartedAt && now.getTime() - windowStartedAt.getTime() <= windowMinutes * 60 * 1000,
    );
    const failedLoginAttempts = withinWindow ? user.failedLoginAttempts + 1 : 1;
    const failedLoginWindowStartedAt = withinWindow ? windowStartedAt : now;
    const lockedUntil = failedLoginAttempts >= threshold ? new Date(now.getTime() + durationMinutes * 60 * 1000) : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts,
        failedLoginWindowStartedAt,
        lockedUntil,
      },
    });

    return lockedUntil;
  }

  private async resetFailedLoginState(user: LoginLockoutState): Promise<void> {
    if (user.failedLoginAttempts === 0 && !user.failedLoginWindowStartedAt && !user.lockedUntil) {
      return;
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        failedLoginWindowStartedAt: null,
        lockedUntil: null,
      },
    });
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

  async refresh(refreshToken: string | undefined): Promise<SessionTokens> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token отсутствует.");
    }

    // Формат токена — `${sessionId}.${tail}`: id сессии нужен, чтобы достать
    // ровно одну запись и сделать одно bcrypt-сравнение. Без id-привязки
    // пришлось бы перебирать все активные сессии в системе.
    const dot = refreshToken.indexOf(".");
    if (dot <= 0 || dot === refreshToken.length - 1) {
      throw new UnauthorizedException("Refresh token недействителен.");
    }
    const sessionId = refreshToken.slice(0, dot);
    const tail = refreshToken.slice(dot + 1);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: { include: { company: true } } },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Refresh token недействителен.");
    }

    const ok = await compare(tail, session.refreshTokenHash);
    if (!ok) {
      throw new UnauthorizedException("Refresh token недействителен.");
    }

    // Зеркало login: заблокированный пользователь или компания не должны
    // получить новую сессию, даже если refresh-токен формально валиден.
    if (session.user.status === UserStatus.blocked) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Учётная запись заблокирована.");
    }
    if (
      session.user.company?.status === CompanyStatus.blocked ||
      session.user.company?.status === CompanyStatus.archived
    ) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException("Доступ к кабинету компании закрыт.");
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    await this.sessionCache.invalidateSession(session.id);

    return this.createSession(session.userId, {}, session.rememberMe);
  }

  async logout(sessionId: string): Promise<{ ok: true }> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.sessionCache.invalidateSession(sessionId);

    return { ok: true };
  }

  async listSessions(userId: string, currentSessionId: string) {
    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        rememberMe: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      current: session.id === currentSessionId,
    }));
  }

  async revokeSession(
    userId: string,
    currentSessionId: string,
    sessionId: string,
  ): Promise<{ ok: true; revokedCurrent: boolean }> {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      throw new BadRequestException("Сессия уже завершена или не найдена.");
    }
    await this.sessionCache.invalidateSession(sessionId);

    return { ok: true, revokedCurrent: sessionId === currentSessionId };
  }

  async logoutAllSessions(userId: string): Promise<{ ok: true; revoked: number }> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.sessionCache.invalidateUser(userId);

    return { ok: true, revoked: result.count };
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

  private async createSession(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string },
    rememberMe: boolean,
  ): Promise<SessionTokens> {
    // Хешируем только случайный хвост; sessionId сам по себе не секрет —
    // он лишь индекс для поиска сессии при refresh.
    const tail = randomBytes(48).toString("base64url");
    const refreshTokenHash = await hash(tail, 12);
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

    const refreshToken = `${session.id}.${tail}`;

    const accessToken = await this.jwt.signAsync(
      { sub: userId, sessionId: session.id },
      {
        // Секрет проверяется в bootstrap() — здесь полагаемся, что он валиден.
        secret: process.env.JWT_ACCESS_SECRET as string,
        expiresIn: "15m",
      },
    );

    return { accessToken, refreshToken };
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
