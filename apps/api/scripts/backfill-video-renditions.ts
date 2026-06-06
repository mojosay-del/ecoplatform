/**
 * Одноразовый идемпотентный бэкофилл: перекодирует уже загруженные видео в
 * H.264/AAC MP4 в нескольких разрешениях (ренишены), чтобы они надёжно
 * воспроизводились во всех браузерах и получили выбор качества в плеере.
 *
 * Зачем: до этой правки видео хранились только в исходном формате; ролики с
 * телефонов (HEVC/.mov) не играли через <video>. Новые загрузки перекодируются
 * фоновым VideoTranscodeService автоматически; этот скрипт закрывает историю.
 *
 * Требования: в окружении должны быть ffmpeg/ffprobe (в прод-образе api они
 * есть), а также DATABASE_URL и S3_* . Уже готовые видео пропускаются.
 *
 * Запуск (из apps/api):
 *   ts-node scripts/backfill-video-renditions.ts
 * В проде — внутри контейнера api:
 *   docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod \
 *     exec api ts-node scripts/backfill-video-renditions.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";
import { VideoTranscodeService } from "../src/files/video-transcode.service";
import { parseVideoRenditions } from "../src/files/video-renditions";

loadEnv({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const prisma = new PrismaClient();
  const service = new VideoTranscodeService(prisma as unknown as PrismaService);

  const videos = await prisma.fileAsset.findMany({
    where: { mimeType: { startsWith: "video/" } },
    orderBy: { createdAt: "asc" },
    select: { id: true, originalName: true, videoRenditions: true },
  });

  let done = 0;
  let skipped = 0;
  let failed = 0;
  for (const video of videos) {
    if (parseVideoRenditions(video.videoRenditions)?.status === "ready") {
      skipped += 1;
      continue;
    }
    process.stdout.write(`Перекодирую ${video.originalName} (${video.id})… `);
    const ok = await service.processAsset(video.id);
    if (ok) {
      done += 1;
      process.stdout.write("готово\n");
    } else {
      failed += 1;
      process.stdout.write("не удалось\n");
    }
  }

  console.log(`\nИтого: перекодировано ${done}, пропущено (уже готовы) ${skipped}, ошибок ${failed}.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
