import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { FileAccessLevel, Prisma, type FileAsset } from "@prisma/client";
import { PlatformSettingsService } from "../admin/settings/platform-settings.service";
// file-type ≥17 поставляется только как ESM. apps/api собирается в CommonJS:
// tsc эмитит require("file-type"), который Node ≥20 грузит синхронно через
// условие экспорта "module-sync" (стабильно на нашем Node 24). В vitest swc
// оставляет ESM-import. Типы tsc берёт из index.d.ts в корне пакета.
import { fileTypeFromBuffer } from "file-type";
import type { RequestUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { processCoverImage, type ProcessedImageVariant } from "./image-presets";
import {
  BLOCKED_UPLOAD_MIME_TYPES,
  GENERIC_DECLARED_MIME_TYPES,
  buildStorageKey,
  canonicalMimeType,
  contentDisposition,
  hasBlockedExtension,
  isAllowedDetectedMime,
  isDeclaredMimeCompatible,
  normalizeMimeType,
  storageKeyWithExtension,
} from "./files-validation.helpers";
import {
  backfillFileReferences,
  clearEntityFileReferences,
  replaceEntityFileReferences,
  type FilesReferenceDeps,
} from "./files-reference.helpers";
import { assertDailyUploadQuota, type FilesQuotaDeps } from "./files-quota.helpers";
import {
  bucketForAccessLevel,
  getS3Client,
  readS3HealthConfig,
  s3PingBucket,
  signS3DownloadUrls,
} from "./files-storage.helpers";
import { toFileAssetResponse } from "./files-response.helpers";
import { isVideoMime, serializeVideoRenditions } from "./video-renditions";
import { VideoTranscodeService } from "./video-transcode.service";
import { deleteUnreferencedFiles, type FilesCleanupDeps } from "./files-cleanup.helpers";
import { buildFileAssetResponses, isPlayableMedia, SIGNED_URL_TTL_SECONDS } from "./files-delivery.helpers";

export type { FileAssetResponse } from "./files-response.helpers";

export type UploadedMemoryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};
export type FileUploadRestriction = "media_only";

type ValidatedUpload = {
  buffer: Buffer;
  extension?: string;
  mimeType: string;
  contentDisposition?: string;
  variants?: ProcessedImageVariant[];
};

// Дефолты лимитов файлов. Реальные значения берутся из настроек платформы
// (Настройки → Файлы) с этими значениями по умолчанию; константы остаются
// fallback'ом для юнит-тестов, где settings не внедрён.
const DEFAULT_MAX_UPLOAD_MB = 100;
const DEFAULT_MAX_COVER_MB = 10;
const DEFAULT_DAILY_QUOTA_MB = 500;
const MB_IN_BYTES = 1024 * 1024;
const S3_HEALTH_TIMEOUT_MS = 1_000;

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: PlatformSettingsService,
    @Optional() private readonly videoTranscode?: VideoTranscodeService,
  ) {}

  private async maxUploadMb(): Promise<number> {
    return (await this.settings?.getValue("files.max_upload_mb")) ?? DEFAULT_MAX_UPLOAD_MB;
  }

  private async maxCoverMb(): Promise<number> {
    return (await this.settings?.getValue("files.max_cover_mb")) ?? DEFAULT_MAX_COVER_MB;
  }

  private async dailyQuotaMb(): Promise<number> {
    return (await this.settings?.getValue("files.daily_quota_mb")) ?? DEFAULT_DAILY_QUOTA_MB;
  }

  getS3HealthConfig() {
    return readS3HealthConfig();
  }

  async pingS3(timeoutMs = S3_HEALTH_TIMEOUT_MS): Promise<void> {
    return s3PingBucket(timeoutMs);
  }

  // Фасад над signS3DownloadUrls — вся S3-логика в files-storage.helpers.
  async signDownloadUrls(
    assets: Array<Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">>,
    ttlSeconds = SIGNED_URL_TTL_SECONDS,
    options: { inline?: boolean } = {},
  ): Promise<Map<string, string | null>> {
    return signS3DownloadUrls(assets, ttlSeconds, options);
  }

  async createSignedDownloadUrl(
    asset: Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">,
    ttlSeconds = SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    return (await signS3DownloadUrls([asset], ttlSeconds)).get(asset.id) ?? null;
  }

  async replaceFileReferences(
    entityType: string,
    entityId: string,
    fileIds: Array<string | null | undefined>,
  ): Promise<void> {
    await replaceEntityFileReferences(this.referenceDeps, entityType, entityId, fileIds);
  }

  async clearFileReferences(entityType: string, entityId: string): Promise<void> {
    await clearEntityFileReferences(this.referenceDeps, entityType, entityId);
  }

  async backfillFileReferencesIfNeeded(): Promise<{ scanned: number }> {
    return backfillFileReferences(this.referenceDeps);
  }

  private get referenceDeps(): FilesReferenceDeps {
    return { prisma: this.prisma };
  }

  private get cleanupDeps(): FilesCleanupDeps {
    return { prisma: this.prisma };
  }

  private async detectUploadMime(buffer: Buffer): Promise<string | null> {
    try {
      return normalizeMimeType((await fileTypeFromBuffer(buffer))?.mime);
    } catch {
      return null;
    }
  }

  private async validateUpload(
    file: UploadedMemoryFile,
    input: { imagePreset?: "cover"; restriction?: FileUploadRestriction },
  ): Promise<ValidatedUpload> {
    const declaredMime = normalizeMimeType(file.mimetype);
    if (BLOCKED_UPLOAD_MIME_TYPES.has(declaredMime) || hasBlockedExtension(file.originalname)) {
      throw new BadRequestException("Формат файла не поддерживается.");
    }

    const detectedMime = await this.detectUploadMime(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException("Не удалось определить безопасный тип файла.");
    }
    if (BLOCKED_UPLOAD_MIME_TYPES.has(detectedMime) || !isAllowedDetectedMime(detectedMime)) {
      throw new BadRequestException("Формат файла не поддерживается.");
    }
    if (!isDeclaredMimeCompatible(declaredMime, detectedMime)) {
      throw new BadRequestException("Тип файла не совпадает с его содержимым.");
    }

    if (
      input.restriction === "media_only" &&
      !detectedMime.startsWith("image/") &&
      !detectedMime.startsWith("video/")
    ) {
      throw new BadRequestException("Можно загрузить только изображение или видео.");
    }

    if (input.imagePreset === "cover") {
      return processCoverImage(file.buffer, detectedMime);
    }

    return {
      buffer: file.buffer,
      extension: undefined,
      mimeType: detectedMime,
      contentDisposition: contentDisposition(detectedMime, file.originalname),
    };
  }

  private validateMetadataInput(input: {
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    accessLevel?: FileAccessLevel;
  }) {
    const declaredMime = normalizeMimeType(input.mimeType);
    const mimeType = canonicalMimeType(declaredMime);

    if (
      !mimeType ||
      GENERIC_DECLARED_MIME_TYPES.has(mimeType) ||
      BLOCKED_UPLOAD_MIME_TYPES.has(mimeType) ||
      hasBlockedExtension(input.originalName) ||
      !isAllowedDetectedMime(mimeType)
    ) {
      throw new BadRequestException("Формат файла не поддерживается.");
    }

    return {
      ...input,
      mimeType,
    };
  }

  private get quotaDeps(): FilesQuotaDeps {
    return { prisma: this.prisma, dailyQuotaMb: () => this.dailyQuotaMb() };
  }

  async assertCoverImageAllowed(fileId: string | null | undefined, user: RequestUser): Promise<void> {
    if (!fileId) {
      return;
    }

    const asset = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
      select: { accessLevel: true, mimeType: true, uploadedById: true },
    });
    if (!asset) {
      throw new NotFoundException("Файл обложки не найден.");
    }
    if (asset.accessLevel !== FileAccessLevel.public || !asset.mimeType.startsWith("image/")) {
      throw new ForbiddenException("В качестве обложки можно использовать только публичное изображение.");
    }
    if (!user.platformRoles.includes("admin") && asset.uploadedById !== user.id) {
      throw new ForbiddenException("В качестве обложки можно использовать только файл, загруженный вами.");
    }
  }

  async createMetadata(
    input: { originalName: string; mimeType: string; sizeBytes: number; accessLevel?: FileAccessLevel },
    userId: string,
  ) {
    const metadata = this.validateMetadataInput(input);
    const maxUploadMb = await this.maxUploadMb();
    if (metadata.sizeBytes > maxUploadMb * MB_IN_BYTES) {
      throw new BadRequestException(`Файл больше ${maxUploadMb} МБ.`);
    }
    await assertDailyUploadQuota(this.quotaDeps, userId, metadata.sizeBytes);

    const asset = await this.prisma.fileAsset.create({
      data: {
        originalName: metadata.originalName,
        mimeType: metadata.mimeType,
        sizeBytes: metadata.sizeBytes,
        accessLevel: metadata.accessLevel ?? FileAccessLevel.authenticated,
        storageKey: buildStorageKey(metadata.originalName),
        uploadedById: userId,
      },
    });

    return toFileAssetResponse(asset);
  }

  async upload(
    file: UploadedMemoryFile | undefined,
    input: { accessLevel?: FileAccessLevel; imagePreset?: "cover"; restriction?: FileUploadRestriction },
    userId: string,
  ) {
    if (!file) {
      throw new BadRequestException("Файл не передан.");
    }
    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException("Файл пустой.");
    }
    const maxUploadMb = await this.maxUploadMb();
    if (file.size > maxUploadMb * MB_IN_BYTES) {
      throw new BadRequestException(`Файл больше ${maxUploadMb} МБ.`);
    }
    if (input.imagePreset === "cover") {
      const maxCoverMb = await this.maxCoverMb();
      if (file.size > maxCoverMb * MB_IN_BYTES) {
        throw new BadRequestException(`Обложка больше ${maxCoverMb} МБ.`);
      }
    }

    await assertDailyUploadQuota(this.quotaDeps, userId, file.size);

    const upload = await this.validateUpload(file, input);
    const { client, bucket } = getS3Client();
    const accessLevel = input.accessLevel ?? FileAccessLevel.public;
    // Приватные файлы кладём в приватный бакет (см. bucketForAccessLevel) —
    // публичные остаются в public-read бакете. Удаление и presign используют ту
    // же функцию выбора бакета, поэтому объект всегда ищется там, где лежит.
    const targetBucket = bucketForAccessLevel(accessLevel, bucket);
    const storageKey = buildStorageKey(file.originalname, upload.extension);
    const variantUploads = (upload.variants ?? []).map((variant) => ({
      ...variant,
      storageKey: storageKeyWithExtension(storageKey, variant.extension),
    }));

    await Promise.all([
      client.send(
        new PutObjectCommand({
          Bucket: targetBucket,
          Key: storageKey,
          Body: upload.buffer,
          ContentType: upload.mimeType,
          ContentDisposition: upload.contentDisposition,
          ContentLength: upload.buffer.length,
        }),
      ),
      ...variantUploads.map((variant) =>
        client.send(
          new PutObjectCommand({
            Bucket: targetBucket,
            Key: variant.storageKey,
            Body: variant.buffer,
            ContentType: variant.mimeType,
            ContentLength: variant.buffer.length,
          }),
        ),
      ),
    ]);

    const variants =
      variantUploads.length > 0
        ? ({
            webp: {
              storageKey,
              mimeType: upload.mimeType,
              sizeBytes: upload.buffer.length,
            },
            ...Object.fromEntries(
              variantUploads.map((variant) => [
                variant.format,
                {
                  storageKey: variant.storageKey,
                  mimeType: variant.mimeType,
                  sizeBytes: variant.buffer.length,
                },
              ]),
            ),
          } satisfies Prisma.InputJsonObject)
        : undefined;

    // Видео сразу помечаем pending — фоновый транскодер (VideoTranscodeService)
    // перекодирует его в H.264/AAC MP4 в нескольких разрешениях.
    const videoRenditions = isVideoMime(upload.mimeType)
      ? (serializeVideoRenditions({ status: "pending", renditions: [] }) as Prisma.InputJsonValue)
      : undefined;

    const asset = await this.prisma.fileAsset.create({
      data: {
        originalName: file.originalname,
        mimeType: upload.mimeType,
        sizeBytes: upload.buffer.length,
        accessLevel,
        storageKey,
        variants,
        videoRenditions,
        uploadedById: userId,
      },
    });

    if (videoRenditions) {
      // Не блокируем HTTP-ответ: перекодировка идёт в фоне.
      this.videoTranscode?.enqueue(asset.id);
    }

    // Сразу отдаём загрузившему рабочую ссылку — для приватного файла presigned,
    // чтобы редактор/превью показали загруженный файл без отдельного запроса.
    const response = toFileAssetResponse(asset);
    response.downloadUrl = await this.createSignedDownloadUrl(asset);
    if (isPlayableMedia(asset.mimeType)) {
      response.streamUrl =
        (await this.signDownloadUrls([asset], SIGNED_URL_TTL_SECONDS, { inline: true })).get(asset.id) ?? null;
    }
    return response;
  }

  async findManyByIds(ids: string[], requester?: RequestUser) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }

    // Приватные metadata по-прежнему НЕ утекают обычным пользователям: им
    // отдаём только public-файлы. Контент-персонал (admin / content_manager)
    // видит и приватные — это файлы, которыми он управляет в редакторе.
    const canSeePrivate = Boolean(
      requester && (requester.platformRoles.includes("admin") || requester.platformRoles.includes("content_manager")),
    );

    const assets = await this.prisma.fileAsset.findMany({
      where: canSeePrivate ? { id: { in: uniqueIds } } : { id: { in: uniqueIds }, accessLevel: FileAccessLevel.public },
      orderBy: { createdAt: "desc" },
    });

    return buildFileAssetResponses(assets, (signedAssets, ttlSeconds, options) =>
      this.signDownloadUrls(signedAssets, ttlSeconds, options),
    );
  }

  async deleteIfUnreferenced(fileIds: string[], actor?: RequestUser): Promise<number> {
    return deleteUnreferencedFiles(this.cleanupDeps, fileIds, actor);
  }
}
