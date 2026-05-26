import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileAccessLevel, Prisma, type FileAsset } from "@prisma/client";
import { fromBuffer } from "file-type";
import { randomUUID } from "crypto";
import { extname } from "path";
import type { RequestUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";
import { processCoverImage, type ProcessedImageVariant } from "./image-presets";

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
  variants: FileAssetImageVariants | null;
};

type ValidatedUpload = {
  buffer: Buffer;
  extension?: string;
  mimeType: string;
  contentDisposition?: string;
  variants?: ProcessedImageVariant[];
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_COVER_UPLOAD_BYTES = 10 * 1024 * 1024;
const DAILY_UPLOAD_QUOTA_BYTES = 500 * 1024 * 1024;
const SAFE_NAME_PATTERN = /[^a-zA-Z0-9._-]+/g;
const GENERIC_DECLARED_MIME_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);
const BLOCKED_UPLOAD_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
]);
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".exe",
  ".htm",
  ".html",
  ".js",
  ".mjs",
  ".msi",
  ".php",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
  ".xhtml",
  ".xml",
]);
const ALLOWED_DETECTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
const MIME_ALIASES: Record<string, string[]> = {
  "application/zip": ["application/x-zip-compressed", "multipart/x-zip"],
  "application/pdf": ["application/x-pdf"],
  "image/jpeg": ["image/pjpeg"],
  "video/quicktime": ["video/mov"],
};
const S3_HEALTH_TIMEOUT_MS = 1_000;

function isPlaceholderS3Value(value: string) {
  return value.startsWith("replace-with-");
}

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

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

  private publicUrl(storageKey: string, accessLevel: FileAccessLevel): string | null {
    if (accessLevel !== FileAccessLevel.public) {
      return null;
    }

    const baseUrl = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT;
    const bucket = process.env.S3_BUCKET;
    if (!baseUrl || !bucket) {
      return null;
    }

    return `${baseUrl.replace(/\/$/, "")}/${bucket}/${storageKey}`;
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
    return {
      ...asset,
      publicUrl: this.publicUrl(asset.storageKey, asset.accessLevel),
      variants: this.variantResponse(asset),
    };
  }

  private compactFileIds(ids: Array<string | null | undefined>): string[] {
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  }

  private collectFileIdsFromPayload(payload: unknown, fileIds = new Set<string>()): Set<string> {
    if (!payload || typeof payload !== "object") {
      return fileIds;
    }
    if (Array.isArray(payload)) {
      payload.forEach((value) => this.collectFileIdsFromPayload(value, fileIds));
      return fileIds;
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.fileId === "string" && record.fileId) {
      fileIds.add(record.fileId);
    }
    Object.values(record).forEach((value) => this.collectFileIdsFromPayload(value, fileIds));
    return fileIds;
  }

  async replaceFileReferences(
    entityType: string,
    entityId: string,
    fileIds: Array<string | null | undefined>,
  ): Promise<void> {
    const uniqueIds = this.compactFileIds(fileIds);
    // Фильтруем orphan-id: админ мог в payload ввести произвольный id,
    // которого нет в FileAsset (типичный сценарий — старый/стёртый файл
    // или хардкод в integration-тесте). FileReference имеет FK с CASCADE —
    // вставка несуществующего id даёт FK violation и 500. Тихо пропускаем.
    const existing =
      uniqueIds.length > 0
        ? await this.prisma.fileAsset.findMany({
            where: { id: { in: uniqueIds } },
            select: { id: true },
          })
        : [];
    const validIds = new Set(existing.map((asset) => asset.id));
    const filtered = uniqueIds.filter((id) => validIds.has(id));
    await this.prisma.$transaction(async (tx) => {
      await tx.fileReference.deleteMany({ where: { entityType, entityId } });
      if (filtered.length === 0) {
        return;
      }
      await tx.fileReference.createMany({
        data: filtered.map((fileId) => ({ fileId, entityType, entityId })),
        skipDuplicates: true,
      });
    });
  }

  async clearFileReferences(entityType: string, entityId: string): Promise<void> {
    await this.prisma.fileReference.deleteMany({ where: { entityType, entityId } });
  }

  async backfillFileReferencesIfNeeded(): Promise<{ scanned: number }> {
    const existing = await this.prisma.fileReference.count();
    if (existing > 0) {
      return { scanned: 0 };
    }

    let scanned = 0;

    const newsPosts = await this.prisma.newsPost.findMany({ include: { blocks: true } });
    for (const post of newsPosts) {
      const fileIds = this.compactFileIds([
        post.coverImageId,
        ...post.blocks.flatMap((block) => Array.from(this.collectFileIdsFromPayload(block.payload))),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await this.replaceFileReferences("news_post", post.id, fileIds);
      scanned += 1;
    }

    const articles = await this.prisma.knowledgeBaseArticle.findMany({ include: { blocks: true } });
    for (const article of articles) {
      const fileIds = this.compactFileIds([
        article.coverImageId,
        ...article.blocks.flatMap((block) => Array.from(this.collectFileIdsFromPayload(block.payload))),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await this.replaceFileReferences("knowledge_base_article", article.id, fileIds);
      scanned += 1;
    }

    const modules = await this.prisma.learningModule.findMany({
      include: {
        chapters: {
          include: {
            lessons: {
              include: { blocks: true, attachments: true },
            },
          },
        },
      },
    });
    for (const module of modules) {
      const fileIds = this.compactFileIds([
        module.coverImageId,
        ...module.chapters.flatMap((chapter) =>
          chapter.lessons.flatMap((lesson) => [
            ...Array.from(
              lesson.blocks.reduce(
                (ids, block) => this.collectFileIdsFromPayload(block.payload, ids),
                new Set<string>(),
              ),
            ),
            ...lesson.attachments.map((attachment) => attachment.fileId),
          ]),
        ),
      ]);
      if (fileIds.length === 0) {
        continue;
      }
      await this.replaceFileReferences("learning_module", module.id, fileIds);
      scanned += 1;
    }

    return { scanned };
  }

  private payloadContainsFileId(payload: unknown, fileId: string): boolean {
    if (!payload || typeof payload !== "object") {
      return false;
    }

    if (Array.isArray(payload)) {
      return payload.some((value) => this.payloadContainsFileId(value, fileId));
    }

    const record = payload as Record<string, unknown>;
    if (record.fileId === fileId) {
      return true;
    }

    return Object.values(record).some((value) => this.payloadContainsFileId(value, fileId));
  }

  private normalizeMimeType(mimeType: string | undefined | null): string {
    return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  }

  private isAllowedDetectedMime(mimeType: string): boolean {
    return ALLOWED_DETECTED_MIME_TYPES.has(mimeType) || mimeType.startsWith("audio/") || mimeType.startsWith("video/");
  }

  private isDeclaredMimeCompatible(declaredMime: string, detectedMime: string): boolean {
    if (!declaredMime || GENERIC_DECLARED_MIME_TYPES.has(declaredMime)) {
      return true;
    }
    if (declaredMime === detectedMime) {
      return true;
    }

    return (MIME_ALIASES[detectedMime] ?? []).includes(declaredMime);
  }

  private hasBlockedExtension(originalName: string): boolean {
    return BLOCKED_UPLOAD_EXTENSIONS.has(extname(originalName).toLowerCase());
  }

  private attachmentDisposition(originalName: string): string {
    const fallback = (originalName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "file").slice(0, 120);
    return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(originalName)}`;
  }

  private contentDisposition(mimeType: string, originalName: string): string | undefined {
    if (mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/")) {
      return undefined;
    }

    return this.attachmentDisposition(originalName);
  }

  private async detectUploadMime(buffer: Buffer): Promise<string | null> {
    try {
      return this.normalizeMimeType((await fromBuffer(buffer))?.mime);
    } catch {
      return null;
    }
  }

  private async validateUpload(file: UploadedMemoryFile, input: { imagePreset?: "cover" }): Promise<ValidatedUpload> {
    const declaredMime = this.normalizeMimeType(file.mimetype);
    if (BLOCKED_UPLOAD_MIME_TYPES.has(declaredMime) || this.hasBlockedExtension(file.originalname)) {
      throw new BadRequestException("Формат файла не поддерживается.");
    }

    const detectedMime = await this.detectUploadMime(file.buffer);
    if (!detectedMime) {
      throw new BadRequestException("Не удалось определить безопасный тип файла.");
    }
    if (BLOCKED_UPLOAD_MIME_TYPES.has(detectedMime) || !this.isAllowedDetectedMime(detectedMime)) {
      throw new BadRequestException("Формат файла не поддерживается.");
    }
    if (!this.isDeclaredMimeCompatible(declaredMime, detectedMime)) {
      throw new BadRequestException("Тип файла не совпадает с его содержимым.");
    }

    if (input.imagePreset === "cover") {
      return processCoverImage(file.buffer, detectedMime);
    }

    return {
      buffer: file.buffer,
      extension: undefined,
      mimeType: detectedMime,
      contentDisposition: this.contentDisposition(detectedMime, file.originalname),
    };
  }

  private storageKey(originalName: string, extensionOverride?: string): string {
    const originalExtension = extname(originalName).toLowerCase();
    const extension = extensionOverride ?? originalExtension;
    const baseName = originalName
      .slice(0, Math.max(0, originalName.length - originalExtension.length))
      .trim()
      .replace(SAFE_NAME_PATTERN, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const safeBaseName = baseName || "file";
    const date = new Date().toISOString().slice(0, 10);

    return `uploads/${date}/${randomUUID()}-${safeBaseName}${extension}`;
  }

  private storageKeyWithExtension(storageKey: string, extension: string): string {
    const currentExtension = extname(storageKey);
    return `${storageKey.slice(0, Math.max(0, storageKey.length - currentExtension.length))}${extension}`;
  }

  private fileStorageKeys(asset: FileAsset): string[] {
    const variants = Object.values(this.parseImageVariants(asset.variants)).map((variant) => variant.storageKey);
    return Array.from(new Set([asset.storageKey, ...variants]));
  }

  private async dailyUploadScopeUserIds(userId: string): Promise<string[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { companyId: true },
    });
    if (!user?.companyId) {
      return [userId];
    }

    const companyUsers = await this.prisma.user.findMany({
      where: { companyId: user.companyId },
      select: { id: true },
    });
    return companyUsers.length > 0 ? companyUsers.map((companyUser) => companyUser.id) : [userId];
  }

  private quotaResetHours(windowStart: Date): number {
    const resetAt = windowStart.getTime() + 24 * 60 * 60 * 1000;
    return Math.max(1, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)));
  }

  private async assertDailyUploadQuota(userId: string, nextFileBytes: number): Promise<void> {
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const userIds = await this.dailyUploadScopeUserIds(userId);
    const aggregate = await this.prisma.fileAsset.aggregate({
      where: {
        uploadedById: { in: userIds },
        createdAt: { gte: windowStart },
      },
      _sum: { sizeBytes: true },
    });
    const usedBytes = aggregate._sum.sizeBytes ?? 0;
    if (usedBytes + nextFileBytes <= DAILY_UPLOAD_QUOTA_BYTES) {
      return;
    }

    throw new HttpException(
      `Дневной лимит загрузок исчерпан. Будет сброшен через ${this.quotaResetHours(windowStart)} ч.`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
    const asset = await this.prisma.fileAsset.create({
      data: {
        originalName: input.originalName,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        accessLevel: input.accessLevel ?? FileAccessLevel.authenticated,
        storageKey: `dev/${Date.now()}-${input.originalName}`,
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
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("Файл больше 100 МБ.");
    }
    if (input.imagePreset === "cover" && file.size > MAX_COVER_UPLOAD_BYTES) {
      throw new BadRequestException("Обложка больше 10 МБ.");
    }

    await this.assertDailyUploadQuota(userId, file.size);

    const upload = await this.validateUpload(file, input);
    const { client, bucket } = this.getClient();
    const accessLevel = input.accessLevel ?? FileAccessLevel.public;
    const storageKey = this.storageKey(file.originalname, upload.extension);
    const variantUploads = (upload.variants ?? []).map((variant) => ({
      ...variant,
      storageKey: this.storageKeyWithExtension(storageKey, variant.extension),
    }));

    await Promise.all([
      client.send(
        new PutObjectCommand({
          Bucket: bucket,
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
            Bucket: bucket,
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

    return this.toResponse(asset);
  }

  async findManyByIds(ids: string[]) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return [];
    }

    const assets = await this.prisma.fileAsset.findMany({
      where: { id: { in: uniqueIds }, accessLevel: FileAccessLevel.public },
      orderBy: { createdAt: "desc" },
    });

    return assets.map((asset) => this.toResponse(asset));
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

    return blockGroups.some((blocks) => blocks.some((block) => this.payloadContainsFileId(block.payload, fileId)));
  }

  async deleteIfUnreferenced(fileIds: string[]) {
    const uniqueIds = Array.from(new Set(fileIds.filter(Boolean)));

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

      const config = this.getS3Config();
      if (config) {
        await Promise.all(
          this.fileStorageKeys(asset).map((key) =>
            config.client.send(
              new DeleteObjectCommand({
                Bucket: config.bucket,
                Key: key,
              }),
            ),
          ),
        );
      }

      await this.prisma.fileAsset.delete({ where: { id: fileId } });
    }
  }
}
