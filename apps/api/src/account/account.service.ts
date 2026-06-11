import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FileAccessLevel } from "@prisma/client";
import type { AuthMeUser } from "@ecoplatform/shared";
import { getAuthMeUser } from "../auth/auth-profile.helpers";
import { FilesService } from "../files/files.service";
import { PrismaService } from "../prisma/prisma.service";

// Аватары пользователей. Само изображение загружается общим POST /files/upload
// (с ресайзом и валидацией), сюда приходит только id уже загруженного публичного
// файла — ровно как обложки контента (coverImageId). Это держит S3-логику в
// одном месте (FilesService) и не плодит ещё один multipart-роут.
@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

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
      // Старое фото больше никем не используется — чистим из S3 и БД.
      if (current.avatarFileId) {
        await this.files.deleteIfUnreferenced([current.avatarFileId]);
      }
    }

    return getAuthMeUser({ prisma: this.prisma }, userId);
  }

  async removeAvatar(userId: string): Promise<AuthMeUser> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarFileId: true },
    });
    if (current.avatarFileId) {
      await this.prisma.user.update({ where: { id: userId }, data: { avatarFileId: null } });
      await this.files.deleteIfUnreferenced([current.avatarFileId]);
    }
    return getAuthMeUser({ prisma: this.prisma }, userId);
  }
}
