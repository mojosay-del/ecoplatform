import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
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
  downloadContentDisposition,
  hasBlockedExtension,
  isAllowedDetectedMime,
  isDeclaredMimeCompatible,
  normalizeMimeType,
  storageKeyWithExtension,
} from "./files-validation.helpers";
import {
  backfillFileReferences,
  clearEntityFileReferences,
  payloadContainsFileId,
  replaceEntityFileReferences,
  type FilesReferenceDeps,
} from "./files-reference.helpers";
import { assertDailyUploadQuota, type FilesQuotaDeps } from "./files-quota.helpers";

export type UploadedMemoryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type FileReferenceBlock = { payload: unknown };
type ImageVariantFormat = "webp" | "avif";
type StoredImageVariant = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};
type FileAssetImageVariant = StoredImageVariant & {
  publicUrl: string | null;
};
type FileAssetImageVariants = Partial<Record<ImageVariantFormat, FileAssetImageVariant>>;
export type FileAssetResponse = Omit<FileAsset, "variants"> & {
  publicUrl: string | null;
  // Ссылка для скачивания. Для public-файлов совпадает с publicUrl; для
  // приватных — короткоживущая presigned-ссылка (или null, если S3 не настроен
  // / запросившему не положено). См. signDownloadUrls.
  downloadUrl: string | null;
  variants: FileAssetImageVariants | null;
};

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
// Срок жизни presigned-ссылки на приватный файл. Час — достаточно, чтобы открыть
// урок и скачать материалы за сессию; по истечении фронт перезапрашивает урок,
// и доступ перепроверяется заново (истёкшая подписка ссылку уже не получит).
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isPlaceholderS3Value(value: string) {
  return value.startsWith("replace-with-");
}

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly settings?: PlatformSettingsService,
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

  private getS3Config() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION ?? "ru-1";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (
      !endpoint ||
      !bucket ||
      !accessKeyId ||
      !secretAccessKey ||
      isPlaceholderS3Value(bucket) ||
      isPlaceholderS3Value(accessKeyId) ||
      isPlaceholderS3Value(secretAccessKey)
    ) {
      return null;
    }

    return {
      client: new S3Client({
        endpoint,
        region,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      }),
      bucket,
      publicBaseUrl: process.env.S3_PUBLIC_BASE_URL ?? endpoint,
    };
  }

  private getClient() {
    const config = this.getS3Config();
    if (!config) {
      throw new BadRequestException("S3-хранилище не настроено.");
    }

    return config;
  }

  getS3HealthConfig() {
    const config = this.getS3Config();
    if (!config) {
      return { configured: false };
    }
    config.client.destroy();

    return {
      configured: true,
      endpoint: process.env.S3_ENDPOINT,
      bucket: config.bucket,
    };
  }

  async pingS3(timeoutMs = S3_HEALTH_TIMEOUT_MS): Promise<void> {
    const config = this.getS3Config();
    if (!config) {
      throw new BadRequestException("S3-хранилище не настроено.");
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      await config.client.send(new HeadBucketCommand({ Bucket: config.bucket }), {
        abortSignal: abortController.signal,
      });
    } finally {
      clearTimeout(timeout);
      config.client.destroy();
    }
  }

  private directObjectUrl(baseUrl: string, bucket: string, storageKey: string): string {
    return `${baseUrl.replace(/\/$/, "")}/${bucket}/${storageKey}`;
  }

  private publicUrl(storageKey: string, accessLevel: FileAccessLevel): string | null {
    if (accessLevel !== FileAccessLevel.public) {
      return null;
    }

    const baseUrl = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    if (!baseUrl || !bucket) {
      return null;
    }

    return this.directObjectUrl(baseUrl, bucket, storageKey);
  }

  // Отдельный приватный бакет для непубличных файлов (вложения платных уроков).
  // Если не настроен — возвращаем null, и всё работает по-старому (мягкая
  // деградация: до настройки инфраструктуры файлы остаются в публичном бакете).
  private privateBucket(): string | null {
    const bucket = process.env.S3_PRIVATE_BUCKET;
    if (!bucket || isPlaceholderS3Value(bucket)) {
      return null;
    }
    return bucket;
  }

  // Бакет, в котором ФИЗИЧЕСКИ лежит объект данного уровня доступа: public — в
  // обычном public-read бакете, остальное — в приватном (если он настроен).
  // Единая точка истины для upload / delete / presign — они обязаны совпадать.
  private bucketForAccessLevel(accessLevel: FileAccessLevel, publicBucket: string): string {
    if (accessLevel === FileAccessLevel.public) {
      return publicBucket;
    }
    return this.privateBucket() ?? publicBucket;
  }

  /**
   * Считает ссылку для скачивания пачки файлов с учётом уровня доступа:
   *  - public → прямая публичная ссылка (как раньше, кешируется CDN);
   *  - не public + настроен приватный бакет → presigned GET на SIGNED_URL_TTL_SECONDS;
   *  - не public + приватный бакет НЕ настроен → fallback на прямую ссылку
   *    (объект ещё в публичном бакете, не мигрирован) — без регрессии выдачи;
   *  - S3 не настроен → null.
   * Принимает пачку, чтобы на странице урока создавать S3-клиент один раз.
   */
  async signDownloadUrls(
    assets: Array<Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">>,
    ttlSeconds = SIGNED_URL_TTL_SECONDS,
  ): Promise<Map<string, string | null>> {
    const urls = new Map<string, string | null>();
    if (assets.length === 0) {
      return urls;
    }

    const needsPrivate = assets.some((asset) => asset.accessLevel !== FileAccessLevel.public);
    const config = needsPrivate ? this.getS3Config() : null;
    const privateBucket = needsPrivate ? this.privateBucket() : null;

    try {
      for (const asset of assets) {
        if (asset.accessLevel === FileAccessLevel.public) {
          urls.set(asset.id, this.publicUrl(asset.storageKey, asset.accessLevel));
          continue;
        }
        if (!config) {
          urls.set(asset.id, null);
          continue;
        }
        if (!privateBucket) {
          urls.set(asset.id, this.directObjectUrl(config.publicBaseUrl, config.bucket, asset.storageKey));
          continue;
        }
        const command = new GetObjectCommand({
          Bucket: privateBucket,
          Key: asset.storageKey,
          ResponseContentDisposition: downloadContentDisposition(asset.originalName),
        });
        urls.set(asset.id, await getSignedUrl(config.client, command, { expiresIn: ttlSeconds }));
      }
    } finally {
      // getS3Config() создаёт клиента заново на каждый вызов — закрываем его,
      // чтобы не накапливать дескрипторы пула соединений.
      config?.client.destroy();
    }

    return urls;
  }

  async createSignedDownloadUrl(
    asset: Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">,
    ttlSeconds = SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    return (await this.signDownloadUrls([asset], ttlSeconds)).get(asset.id) ?? null;
  }

  private parseImageVariants(raw: Prisma.JsonValue | null | undefined): Record<string, StoredImageVariant> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }

    const variants: Record<string, StoredImageVariant> = {};
    for (const [format, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const candidate = value as Record<string, unknown>;
      if (
        typeof candidate.storageKey !== "string" ||
        typeof candidate.mimeType !== "string" ||
        typeof candidate.sizeBytes !== "number"
      ) {
        continue;
      }
      variants[format] = {
        storageKey: candidate.storageKey,
        mimeType: candidate.mimeType,
        sizeBytes: candidate.sizeBytes,
      };
    }
    return variants;
  }

  private variantResponse(asset: FileAsset): FileAssetImageVariants | null {
    const parsed = this.parseImageVariants(asset.variants);
    const entries = Object.entries(parsed).map(([format, variant]) => [
      format,
      {
        ...variant,
        publicUrl: this.publicUrl(variant.storageKey, asset.accessLevel),
      },
    ]);
    return entries.length > 0 ? (Object.fromEntries(entries) as FileAssetImageVariants) : null;
  }

  private toResponse(asset: FileAsset): FileAssetResponse {
    const publicUrl = this.publicUrl(asset.storageKey, asset.accessLevel);
    return {
      ...asset,
      publicUrl,
      // Базовое значение: для public — публичная ссылка, для приватных — null.
      // Вызовы, которым нужна presigned-ссылка для приватного файла, перезаписывают
      // это поле через signDownloadUrls (см. upload / findManyByIds).
      downloadUrl: publicUrl,
      variants: this.variantResponse(asset),
    };
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

  private async detectUploadMime(buffer: Buffer): Promise<string | null> {
    try {
      return normalizeMimeType((await fileTypeFromBuffer(buffer))?.mime);
    } catch {
      return null;
    }
  }

  private async validateUpload(file: UploadedMemoryFile, input: { imagePreset?: "cover" }): Promise<ValidatedUpload> {
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

  private fileStorageKeys(asset: FileAsset): string[] {
    const variants = Object.values(this.parseImageVariants(asset.variants)).map((variant) => variant.storageKey);
    return Array.from(new Set([asset.storageKey, ...variants]));
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

    return this.toResponse(asset);
  }

  async upload(
    file: UploadedMemoryFile | undefined,
    input: { accessLevel?: FileAccessLevel; imagePreset?: "cover" },
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
    const { client, bucket } = this.getClient();
    const accessLevel = input.accessLevel ?? FileAccessLevel.public;
    // Приватные файлы кладём в приватный бакет (см. bucketForAccessLevel) —
    // публичные остаются в public-read бакете. Удаление и presign используют ту
    // же функцию выбора бакета, поэтому объект всегда ищется там, где лежит.
    const targetBucket = this.bucketForAccessLevel(accessLevel, bucket);
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

    const asset = await this.prisma.fileAsset.create({
      data: {
        originalName: file.originalname,
        mimeType: upload.mimeType,
        sizeBytes: upload.buffer.length,
        accessLevel,
        storageKey,
        variants,
        uploadedById: userId,
      },
    });

    // Сразу отдаём загрузившему рабочую ссылку — для приватного файла presigned,
    // чтобы редактор/превью показали загруженный файл без отдельного запроса.
    const response = this.toResponse(asset);
    response.downloadUrl = await this.createSignedDownloadUrl(asset);
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

    const signed = await this.signDownloadUrls(assets);
    return assets.map((asset) => ({ ...this.toResponse(asset), downloadUrl: signed.get(asset.id) ?? null }));
  }

  private async hasStructuredReference(fileId: string) {
    const [newsCovers, learningCovers, knowledgeCovers, lessonAttachments, commentAttachments] = await Promise.all([
      this.prisma.newsPost.count({ where: { coverImageId: fileId } }),
      this.prisma.learningModule.count({ where: { coverImageId: fileId } }),
      this.prisma.knowledgeBaseArticle.count({ where: { coverImageId: fileId } }),
      this.prisma.lessonAttachment.count({ where: { fileId } }),
      this.prisma.commentAttachment.count({ where: { fileId } }),
    ]);

    return newsCovers + learningCovers + knowledgeCovers + lessonAttachments + commentAttachments > 0;
  }

  private async hasBlockReference(fileId: string) {
    const blockGroups: FileReferenceBlock[][] = await Promise.all([
      this.prisma.newsContentBlock.findMany({ select: { payload: true } }),
      this.prisma.lessonContentBlock.findMany({ select: { payload: true } }),
      this.prisma.knowledgeBaseBlock.findMany({ select: { payload: true } }),
    ]);

    return blockGroups.some((blocks) => blocks.some((block) => payloadContainsFileId(block.payload, fileId)));
  }

  private canDeleteAsset(asset: FileAsset, actor?: RequestUser): boolean {
    if (!actor) {
      return true;
    }

    return actor.platformRoles.includes("admin") || asset.uploadedById === actor.id;
  }

  async deleteIfUnreferenced(fileIds: string[], actor?: RequestUser): Promise<number> {
    const uniqueIds = Array.from(new Set(fileIds.filter(Boolean)));
    let deleted = 0;

    for (const fileId of uniqueIds) {
      const [asset, referenceCount, hasStructuredReference, hasBlockReference] = await Promise.all([
        this.prisma.fileAsset.findUnique({ where: { id: fileId } }),
        this.prisma.fileReference.count({ where: { fileId } }),
        this.hasStructuredReference(fileId),
        this.hasBlockReference(fileId),
      ]);

      if (!asset || referenceCount > 0 || hasStructuredReference || hasBlockReference) {
        continue;
      }

      if (!this.canDeleteAsset(asset, actor)) {
        throw new ForbiddenException("Можно удалить только файл, загруженный вами.");
      }

      const config = this.getS3Config();
      if (config) {
        // Удаляем из того же бакета, куда объект был загружен по его уровню доступа.
        const objectBucket = this.bucketForAccessLevel(asset.accessLevel, config.bucket);
        await Promise.all(
          this.fileStorageKeys(asset).map((key) =>
            config.client.send(
              new DeleteObjectCommand({
                Bucket: objectBucket,
                Key: key,
              }),
            ),
          ),
        );
      }

      await this.prisma.fileAsset.delete({ where: { id: fileId } });
      deleted += 1;
    }

    return deleted;
  }
}
