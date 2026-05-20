import { Injectable } from "@nestjs/common";
import { FileAccessLevel } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async createMetadata(input: { originalName: string; mimeType: string; sizeBytes: number; accessLevel?: FileAccessLevel }, userId: string) {
    // На первом этапе файл физически ещё не кладём в S3: создаём метаданные и
    // стабильный storageKey. Позже сюда подключится реальный upload adapter.
    return this.prisma.fileAsset.create({
      data: {
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        accessLevel: input.accessLevel ?? FileAccessLevel.authenticated,
        storageKey: `dev/${Date.now()}-${input.originalName}`,
        uploadedById: userId,
      },
    });
  }
}
