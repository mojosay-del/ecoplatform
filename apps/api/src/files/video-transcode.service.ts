import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { Injectable, Logger } from "@nestjs/common";
import { GetObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { FileAccessLevel, Prisma, VideoTranscodeStatus } from "@prisma/client";
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

// Жёсткий лимит на один прогон ffmpeg/ffprobe (M-11): зависший процесс не должен
// вешать весь конвейер. По умолчанию 15 минут, настраивается env.
const TRANSCODE_TIMEOUT_MS = Math.max(10_000, Number(process.env.VIDEO_TRANSCODE_TIMEOUT_MS) || 15 * 60 * 1000);

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
        const assetId = await this.claimNextPending();
        if (!assetId) break;
        const ok = await this.processAsset(assetId);
        if (ok) processed += 1;
      }
    } finally {
      this.running = false;
    }
    return processed;
  }

  // Атомарно «забирает» самое СТАРОЕ незавершённое видео (pending или
  // зависшее в processing после краша) и помечает processing. Раньше брались
  // только 50 свежих с фильтром в JS — бэклог старее топ-50 голодал (M-10).
  // `FOR UPDATE SKIP LOCKED` + перевод в processing исключают двойную обработку
  // одного видео на нескольких инстансах API (часть L-7). Возвращает id или null.
  private async claimNextPending(): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      UPDATE "FileAsset"
      SET "videoStatus" = ${VideoTranscodeStatus.processing}::"VideoTranscodeStatus"
      WHERE "id" = (
        SELECT "id" FROM "FileAsset"
        WHERE "videoStatus" IN (
          ${VideoTranscodeStatus.pending}::"VideoTranscodeStatus",
          ${VideoTranscodeStatus.processing}::"VideoTranscodeStatus"
        )
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `);
    return rows[0]?.id ?? null;
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
        // L-7: готовый ренишен (до 100 МБ × до 3 шт) НЕ грузим целиком в Buffer,
        // а стримим с диска в S3 через lib-storage Upload (multipart): буферизует
        // по одной ~5-МБ части за раз и ретраит по частям — низкий пик памяти и
        // безопасные ретраи (сырой поток в PutObject при ретрае не перечитать).
        const sizeBytes = await this.runFfmpeg(sourcePath, outPath, height);
        const renditionKey = storageKeyWithExtension(asset.storageKey, `.${height}p.mp4`);
        await new Upload({
          client,
          params: {
            Bucket: sourceBucket,
            Key: renditionKey,
            Body: createReadStream(outPath),
            ContentType: "video/mp4",
            // Без attachment — чтобы плеер мог воспроизводить inline.
          },
        }).done();
        renditions.push({
          height,
          width: scaledWidth(probe.width, probe.height, height),
          storageKey: renditionKey,
          sizeBytes,
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
      client.destroy();
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
        // Держим JSON и индексируемую колонку в синхроне.
        videoRenditions: serializeVideoRenditions({ status, renditions }) as Prisma.InputJsonValue,
        videoStatus: status as VideoTranscodeStatus,
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

  // Возвращает размер готового файла в байтах (для ContentLength потокового
  // PutObject и метаданных ренишена).
  private async runFfmpeg(input: string, output: string, height: number): Promise<number> {
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
    const { size } = await stat(output); // убедимся, что файл создан, и вернём размер
    return size;
  }

  // Тонкая обёртка над spawn: собирает stdout, отклоняется при ненулевом коде.
  // Жёсткий таймаут (M-11): зависший ffmpeg/ffprobe убивается SIGKILL и промис
  // отклоняется, иначе processAsset не дойдёт до finally и флаг running залипнет
  // навсегда — весь видеоконвейер встанет до рестарта процесса.
  private run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let settled = false;

      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };

      const timer = setTimeout(() => {
        finish(() => {
          child.kill("SIGKILL");
          reject(new Error(`${bin} превысил таймаут ${TRANSCODE_TIMEOUT_MS} мс и был остановлен.`));
        });
      }, TRANSCODE_TIMEOUT_MS);
      timer.unref?.();

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("error", (error) => finish(() => reject(error)));
      child.on("close", (code) => {
        finish(() => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`${bin} завершился с кодом ${code}: ${stderr.slice(-500)}`));
        });
      });
    });
  }

  // Для будущего использования (текущий код хранит только private-видео).
  static isPrivateAsset(accessLevel: FileAccessLevel): boolean {
    return accessLevel !== FileAccessLevel.public;
  }
}
