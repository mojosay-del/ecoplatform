import { BadRequestException, Injectable } from "@nestjs/common";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileAccessLevel, type FileAsset } from "@prisma/client";
import { randomUUID } from "crypto";
import { extname } from "path";
import { PrismaService } from "../prisma/prisma.service";

export type UploadedMemoryFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type FileAssetResponse = FileAsset & {
  publicUrl: string | null;
};

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SAFE_NAME_PATTERN = /[^a-zA-Z0-9._-]+/g;

@Injectable()
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  private getS3Config() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION ?? "ru-1";
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
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

  private toResponse(asset: FileAsset): FileAssetResponse {
    return {
      ...asset,
      publicUrl: this.publicUrl(asset.storageKey, asset.accessLevel),
    };
  }

  private storageKey(originalName: string): string {
    const extension = extname(originalName).toLowerCase();
    const baseName = originalName
      .slice(0, Math.max(0, originalName.length - extension.length))
      .trim()
      .replace(SAFE_NAME_PATTERN, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    const safeBaseName = baseName || "file";
    const date = new Date().toISOString().slice(0, 10);

    return `uploads/${date}/${randomUUID()}-${safeBaseName}${extension}`;
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

  async upload(file: UploadedMemoryFile | undefined, input: { accessLevel?: FileAccessLevel }, userId: string) {
    if (!file) {
      throw new BadRequestException("Файл не передан.");
    }
    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException("Файл пустой.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("Файл больше 100 МБ.");
    }

    const { client, bucket } = this.getClient();
    const accessLevel = input.accessLevel ?? FileAccessLevel.public;
    const storageKey = this.storageKey(file.originalname);

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentLength: file.size,
      }),
    );

    const asset = await this.prisma.fileAsset.create({
      data: {
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        accessLevel,
        storageKey,
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
      where: { id: { in: uniqueIds } },
      orderBy: { createdAt: "desc" },
    });

    return assets.map((asset) => this.toResponse(asset));
  }
}
