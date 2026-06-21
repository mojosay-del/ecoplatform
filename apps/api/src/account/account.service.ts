import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AccountContactChangeField, FileAccessLevel, Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import type {
  AccountContactChangeApplyDto,
  AccountContactChangeStartDto,
  AccountContactChangeVerifyDto,
  AccountProfileUpdateDto,
  AuthMeUser,
} from "@ecoplatform/shared";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
import { getAuthMeUser } from "../auth/auth-profile.helpers";
import {
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  EMAIL_VERIFICATION_TTL_MS,
  emailVerificationCodeMatches,
  generateEmailVerificationCode,
  hashEmailVerificationCode,
} from "../auth/email-verification-code.helpers";
import { EmailService } from "../email/email.service";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../prisma/prisma.service";
import { SessionCacheService } from "../redis/session-cache.service";

type ContactChangeStartResponse = {
  verificationId: string;
  email: string;
  expiresAt: string;
};

// M-9: смена email требует второй код — на НОВЫЙ адрес. apply отдаёт «нужен ещё
// один код» (на новый адрес уже отправлен) вместо немедленного применения.
// Смена телефона применяется сразу (SMS-верификации нового номера пока нет).
type ContactChangeApplyResponse =
  | { requiresNewCode: true; verificationId: string; email: string; expiresAt: string }
  | { requiresNewCode: false; user: AuthMeUser };

const CONTACT_CHANGE_EXPIRED_MESSAGE = "Код устарел. Отправьте новый код подтверждения.";
const CONTACT_CHANGE_TOO_MANY_ATTEMPTS_MESSAGE = "Слишком много попыток. Отправьте новый код подтверждения.";
const CONTACT_CHANGE_WRONG_CODE_MESSAGE = "Неверный код подтверждения.";

// Аватары пользователей. Само изображение загружается общим POST /files/upload
// (с ресайзом и валидацией), сюда приходит только id уже загруженного публичного
// файла — ровно как обложки контента (coverImageId). Это держит S3-логику в
// одном месте (FilesService) и не плодит ещё один multipart-роут.
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
    private readonly settings: PlatformSettingsService,
    private readonly email: EmailService,
    private readonly sessionCache: SessionCacheService,
  ) {}

  async updateProfile(userId: string, input: AccountProfileUpdateDto): Promise<AuthMeUser> {
    const data: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.gender !== undefined) data.gender = input.gender;

    await this.prisma.user.update({
      where: { id: userId },
      data,
    });
    await this.sessionCache.invalidateUser(userId);

    return getAuthMeUser({ prisma: this.prisma, settings: this.settings }, userId);
  }

  async startContactChange(userId: string, input: AccountContactChangeStartDto): Promise<ContactChangeStartResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }

    const verificationId = randomUUID();
    const code = generateEmailVerificationCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);

    await this.prisma.accountContactChangeChallenge.updateMany({
      where: {
        userId,
        field: input.field,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { expiresAt: now },
    });

    await this.prisma.accountContactChangeChallenge.create({
      data: {
        id: verificationId,
        userId,
        field: input.field,
        email: user.email,
        codeHash: hashEmailVerificationCode(verificationId, user.email, code),
        expiresAt,
      },
    });

    try {
      await this.sendContactChangeCode({
        email: user.email,
        field: input.field,
        code,
        expiresAt,
      });
    } catch (error) {
      await this.prisma.accountContactChangeChallenge
        .updateMany({
          where: { id: verificationId, consumedAt: null },
          data: { expiresAt: now },
        })
        .catch(() => undefined);
      throw error;
    }

    return { verificationId, email: user.email, expiresAt: expiresAt.toISOString() };
  }

  async verifyContactChange(userId: string, input: AccountContactChangeVerifyDto): Promise<{ ok: true }> {
    const now = new Date();
    const challenge = await this.prisma.accountContactChangeChallenge.findUnique({
      where: { id: input.verificationId },
    });

    if (!challenge || challenge.userId !== userId || challenge.consumedAt || challenge.expiresAt <= now) {
      throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
    }

    if (challenge.verifiedAt) {
      return { ok: true };
    }

    if (challenge.attempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new BadRequestException(CONTACT_CHANGE_TOO_MANY_ATTEMPTS_MESSAGE);
    }

    if (!emailVerificationCodeMatches(challenge.id, challenge.email, input.code, challenge.codeHash)) {
      const nextAttempts = challenge.attempts + 1;
      const tooManyAttempts = nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS;
      await this.prisma.accountContactChangeChallenge.update({
        where: { id: challenge.id },
        data: {
          attempts: nextAttempts,
          ...(tooManyAttempts ? { expiresAt: now } : {}),
        },
      });
      throw new BadRequestException(
        tooManyAttempts ? CONTACT_CHANGE_TOO_MANY_ATTEMPTS_MESSAGE : CONTACT_CHANGE_WRONG_CODE_MESSAGE,
      );
    }

    await this.prisma.accountContactChangeChallenge.update({
      where: { id: challenge.id },
      data: { verifiedAt: now },
    });

    return { ok: true };
  }

  async applyContactChange(userId: string, input: AccountContactChangeApplyDto): Promise<ContactChangeApplyResponse> {
    const now = new Date();
    const challenge = await this.prisma.accountContactChangeChallenge.findUnique({
      where: { id: input.verificationId },
      select: {
        id: true,
        userId: true,
        field: true,
        email: true,
        verifiedAt: true,
        consumedAt: true,
        expiresAt: true,
      },
    });

    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.field !== input.field ||
      !challenge.verifiedAt ||
      challenge.consumedAt ||
      challenge.expiresAt <= now
    ) {
      throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
    }

    const nextValue = input.field === "email" ? input.email.trim().toLowerCase() : input.phone.trim();
    await this.assertContactValueAvailable(userId, input.field, nextValue);

    // Email: новый адрес НЕ применяется здесь — сперва нужно подтвердить владение
    // им кодом (вторая сторона). apply лишь запоминает новое значение и шлёт код
    // на новый адрес; применение — в confirmContactChange.
    if (input.field === "email") {
      const code = generateEmailVerificationCode();
      const pendingExpiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
      const armed = await this.prisma.accountContactChangeChallenge.updateMany({
        where: {
          id: challenge.id,
          userId,
          field: "email",
          verifiedAt: { not: null },
          consumedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          pendingValue: nextValue,
          pendingCodeHash: hashEmailVerificationCode(challenge.id, nextValue, code),
          pendingAttempts: 0,
          expiresAt: pendingExpiresAt,
        },
      });
      if (armed.count !== 1) {
        throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
      }

      try {
        await this.email.sendNewEmailVerificationCode({ to: nextValue, code, expiresAt: pendingExpiresAt });
      } catch (error) {
        await this.prisma.accountContactChangeChallenge
          .updateMany({
            where: { id: challenge.id, consumedAt: null },
            data: { pendingValue: null, pendingCodeHash: null },
          })
          .catch(() => undefined);
        throw error;
      }

      return {
        requiresNewCode: true,
        verificationId: challenge.id,
        email: nextValue,
        expiresAt: pendingExpiresAt.toISOString(),
      };
    }

    // Телефон: SMS-верификации нового номера пока нет — применяем сразу после
    // подтверждения старой почтой, но шлём алерт на текущий email (M-9).
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.accountContactChangeChallenge.updateMany({
          where: {
            id: challenge.id,
            userId,
            field: "phone",
            verifiedAt: { not: null },
            consumedAt: null,
            expiresAt: { gt: now },
          },
          data: { consumedAt: now },
        });

        if (claimed.count !== 1) {
          throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
        }

        await tx.user.update({ where: { id: userId }, data: { phone: nextValue } });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(this.contactConflictMessage("phone"));
      }
      throw error;
    }

    await this.email.sendContactChangeAlert({ to: challenge.email, field: "phone" });
    await this.sessionCache.invalidateUser(userId);
    return {
      requiresNewCode: false,
      user: await getAuthMeUser({ prisma: this.prisma, settings: this.settings }, userId),
    };
  }

  // M-9: вторая сторона — подтверждение владения новым email кодом, отправленным
  // на новый адрес. Только после этого email применяется + алерт на старый адрес.
  async confirmContactChange(userId: string, input: AccountContactChangeVerifyDto): Promise<AuthMeUser> {
    const now = new Date();
    const challenge = await this.prisma.accountContactChangeChallenge.findUnique({
      where: { id: input.verificationId },
    });

    if (
      !challenge ||
      challenge.userId !== userId ||
      challenge.field !== "email" ||
      !challenge.verifiedAt ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      !challenge.pendingValue ||
      !challenge.pendingCodeHash
    ) {
      throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
    }

    if (challenge.pendingAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new BadRequestException(CONTACT_CHANGE_TOO_MANY_ATTEMPTS_MESSAGE);
    }

    if (!emailVerificationCodeMatches(challenge.id, challenge.pendingValue, input.code, challenge.pendingCodeHash)) {
      const nextAttempts = challenge.pendingAttempts + 1;
      const tooManyAttempts = nextAttempts >= EMAIL_VERIFICATION_MAX_ATTEMPTS;
      await this.prisma.accountContactChangeChallenge.update({
        where: { id: challenge.id },
        data: {
          pendingAttempts: nextAttempts,
          ...(tooManyAttempts ? { expiresAt: now } : {}),
        },
      });
      throw new BadRequestException(
        tooManyAttempts ? CONTACT_CHANGE_TOO_MANY_ATTEMPTS_MESSAGE : CONTACT_CHANGE_WRONG_CODE_MESSAGE,
      );
    }

    const nextEmail = challenge.pendingValue;
    await this.assertContactValueAvailable(userId, "email", nextEmail);

    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.accountContactChangeChallenge.updateMany({
          where: {
            id: challenge.id,
            userId,
            field: "email",
            verifiedAt: { not: null },
            consumedAt: null,
            expiresAt: { gt: now },
            pendingValue: { not: null },
          },
          data: { consumedAt: now },
        });

        if (claimed.count !== 1) {
          throw new BadRequestException(CONTACT_CHANGE_EXPIRED_MESSAGE);
        }

        await tx.user.update({ where: { id: userId }, data: { email: nextEmail } });
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(this.contactConflictMessage("email"));
      }
      throw error;
    }

    // Алерт на СТАРЫЙ адрес (challenge.email хранит исходную почту).
    await this.email.sendContactChangeAlert({ to: challenge.email, field: "email" });
    await this.sessionCache.invalidateUser(userId);
    return getAuthMeUser({ prisma: this.prisma, settings: this.settings }, userId);
  }

  async setAvatar(userId: string, fileId: string): Promise<AuthMeUser> {
    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
      select: { accessLevel: true, mimeType: true, uploadedById: true },
    });
    if (!asset) {
      throw new NotFoundException("Файл не найден.");
    }
    if (asset.accessLevel !== FileAccessLevel.public || !asset.mimeType.startsWith("image/")) {
      throw new BadRequestException("Аватаром может быть только публичное изображение.");
    }
    if (asset.uploadedById !== userId) {
      throw new ForbiddenException("Аватаром можно сделать только загруженный вами файл.");
    }

    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });

    if (current.avatarFileId !== fileId) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: fileId } });
      await this.sessionCache.invalidateUser(userId);
      // Старое фото больше никем не используется — чистим из S3 и БД.
      if (current.avatarFileId) {
        await this.files.deleteIfUnreferenced([current.avatarFileId]);
      }
    }

    return getAuthMeUser({ prisma: this.prisma, settings: this.settings }, userId);
  }

  async removeAvatar(userId: string): Promise<AuthMeUser> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });
    if (current.avatarFileId) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: null } });
      await this.sessionCache.invalidateUser(userId);
      await this.files.deleteIfUnreferenced([current.avatarFileId]);
    }
    return getAuthMeUser({ prisma: this.prisma, settings: this.settings }, userId);
  }

  private async sendContactChangeCode(input: {
    email: string;
    field: AccountContactChangeField;
    code: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.email.sendAccountContactChangeCode({
      to: input.email,
      field: input.field,
      code: input.code,
      expiresAt: input.expiresAt,
    });
  }

  private async assertContactValueAvailable(userId: string, field: AccountContactChangeField, value: string) {
    const existing = await this.prisma.user.findFirst({
      where: field === "email" ? { email: value, NOT: { id: userId } } : { phone: value, NOT: { id: userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(this.contactConflictMessage(field));
    }
  }

  private contactConflictMessage(field: AccountContactChangeField) {
    return field === "email"
      ? "Пользователь с такой почтой уже зарегистрирован."
      : "Пользователь с таким телефоном уже зарегистрирован.";
  }
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
