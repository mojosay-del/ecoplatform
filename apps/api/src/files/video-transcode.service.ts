import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Injectable, Logger } from "@nestjs/common";
import { GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { FileAccessLevel, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { bucketForAccessLevel, getS3Config } from "./files-storage.helpers";
import { storageKeyWithExtension } from "./files-validation.helpers";
import {
  type StoredVideoRendition,
  isVideoMime,
  parseVideoRenditions,
  planRenditionHeights,
  scaledWidth,
  serializeVideoRenditions,
} from "./video-renditions";

const FFMPEG_BIN = process.env.FFMPEG_PATH ?? "ffmpeg";
const FFPROBE_BIN = process.env.FFPROBE_PATH ?? "ffprobe";

/**
 * Перекодирует загруженные видео в H.264/AAC MP4 в 1–3 разрешениях. Зачем:
 * исходники с телефонов (HEVC/.mov и пр.) не играют в браузерах через <video>;
 * перекодировка в baseline-MP4 гарантирует воспроизведение, а несколько
 * разрешений дают выбор качества в плеере. Деградация мягкая: при любой ошибке
 * (нет ffmpeg, битый файл) помечаем failed, а плеер продолжает отдавать оригинал.
 */
@Injectable()
export class VideoTranscodeService {
  private readonly logger = new Logger(VideoTranscodeService.name);
  // Транскодинг тяжёлый по CPU — на одном инстансе API крутим строго по одному.
  private running = false;

  constructor(private readonly prisma: PrismaService) {}

  // Запуск «в фоне» сразу после загрузки видео: не блокирует HTTP-ответ.
  enqueue(assetId: string): void {
    void this.processPending().catch((error) => {
      this.logger.warn(`Не удалось обработать видео после загрузки: ${String(error)}`);
    });
    void assetId;
  }

  // Берём порцию необработанных видео и перекодируем по одному. Возвращает
  // число успешно обработанных. Безопасно к параллельному вызову (cron + upload).
  async processPending(limit = 3): Promise<number> {
    if (this.running) return 0;
    if (!getS3Config()) return 0;
    this.running = true;
    let processed = 0;
    try {
      for (let i = 0; i < limit; i += 1) {
        const asset = await this.findNextPending();
        if (!asset) break;
        const ok = await this.processAsset(asset.id);
        if (ok) processed += 1;
      }
    } finally {
      this.running = false;
    }
    return processed;
  }

  // Видео без готовых ренишенов: либо videoRenditions IS NULL, либо статус
  // pending/processing (processing добираем — мог упасть процесс на полпути).
  private async findNextPending() {
    const candidates = await this.prisma.fileAsset.findMany({
      where: { mimeType: { startsWith: "video/" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, videoRenditions: true },
    });
    for (const candidate of candidates) {
      const data = parseVideoRenditions(candidate.videoRenditions);
      if (!data || data.status === "pending" || data.status === "processing") {
        return candidate;
      }
    }
    return null;
  }

  async processAsset(assetId: string): Promise<boolean> {
    const asset = await this.prisma.fileAsset.findUnique({ where: { id: assetId } });
    if (!asset || !isVideoMime(asset.mimeType)) return false;

    const config = getS3Config();
    if (!config) return false;
    const { client, bucket } = config;
    const sourceBucket = bucketForAccessLevel(asset.accessLevel, bucket);

    await this.setStatus(assetId, "processing", parseVideoRenditions(asset.videoRenditions)?.renditions ?? []);

    const workDir = await mkdtemp(join(tmpdir(), "eco-transcode-"));
    const sourcePath = join(workDir, "source");
    try {
      await this.downloadObject(client, sourceBucket, asset.storageKey, sourcePath);
      const probe = await this.probeDimensions(sourcePath);
      const heights = planRenditionHeights(probe.height);

      const renditions: StoredVideoRendition[] = [];
      for (const height of heights) {
        const outPath = join(workDir, `${height}.mp4`);
        await this.runFfmpeg(sourcePath, outPath, height);
        const buffer = await readFile(outPath);
        const renditionKey = storageKeyWithExtension(asset.storageKey, `.${height}p.mp4`);
        await client.send(
          new PutObjectCommand({
            Bucket: sourceBucket,
            Key: renditionKey,
            Body: buffer,
            ContentType: "video/mp4",
            ContentLength: buffer.length,
            // Без attachment — чтобы плеер мог воспроизводить inline.
          }),
        );
        renditions.push({
          height,
          width: scaledWidth(probe.width, probe.height, height),
          storageKey: renditionKey,
          sizeBytes: buffer.length,
        });
      }

      if (renditions.length === 0) {
        await this.setStatus(assetId, "failed", []);
        return false;
      }
      await this.setStatus(assetId, "ready", renditions);
      this.logger.log(`Видео ${assetId}: готово ${renditions.length} ренишен(ов).`);
      return true;
    } catch (error) {
      this.logger.warn(`Видео ${assetId}: перекодировка не удалась — ${String(error)}`);
      await this.setStatus(assetId, "failed", []).catch(() => undefined);
      return false;
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private async setStatus(
    assetId: string,
    status: "processing" | "ready" | "failed",
    renditions: StoredVideoRendition[],
  ) {
    await this.prisma.fileAsset.update({
      where: { id: assetId },
      data: {
        videoRenditions: serializeVideoRenditions({ status, renditions }) as Prisma.InputJsonValue,
      },
    });
  }

  private async downloadObject(client: S3Client, bucket: string, key: string, destPath: string): Promise<void> {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = response.Body;
    if (!body) throw new Error("Пустое тело объекта S3.");
    await pipeline(body as Readable, createWriteStream(destPath));
  }

  private async probeDimensions(path: string): Promise<{ width: number; height: number }> {
    const output = await this.run(FFPROBE_BIN, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      path,
    ]);
    try {
      const parsed = JSON.parse(output) as { streams?: Array<{ width?: number; height?: number }> };
      const stream = parsed.streams?.[0];
      return { width: Number(stream?.width ?? 0), height: Number(stream?.height ?? 0) };
    } catch {
      return { width: 0, height: 0 };
    }
  }

  private async runFfmpeg(input: string, output: string, height: number): Promise<void> {
    await this.run(FFMPEG_BIN, [
      "-i",
      input,
      // scale=-2:H — высота H, ширина авто (кратна 2, как требует H.264).
      "-vf",
      `scale=-2:${height}`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      output,
    ]);
    await stat(output); // убедимся, что файл создан
  }

  // Тонкая обёртка над spawn: собирает stdout, отклоняется при ненулевом коде.
  private run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => reject(error));
      child.on("close", (code) => {
        if (code === 0) resolve(stdout);
        else reject(new Error(`${bin} завершился с кодом ${code}: ${stderr.slice(-500)}`));
      });
    });
  }

  // Для будущего использования (текущий код хранит только private-видео).
  static isPrivateAsset(accessLevel: FileAccessLevel): boolean {
    return accessLevel !== FileAccessLevel.public;
  }
}
