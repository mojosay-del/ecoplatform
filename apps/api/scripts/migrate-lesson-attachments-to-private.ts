/**
 * Одноразовая идемпотентная миграция: переносит файлы-вложения уроков из
 * публичного S3-бакета в приватный (S3_PRIVATE_BUCKET) и помечает их
 * accessLevel=authenticated. После этого вложения платных уроков отдаются
 * только короткоживущей presigned-ссылкой за paywall (см. files.service.ts),
 * а вечная публичная ссылка перестаёт работать.
 *
 * Зачем: до этой правки все загрузки шли в публичный бакет (accessLevel=public),
 * поэтому файлы курсов были доступны по прямой вечной ссылке без подписки.
 * Новые вложения уже грузятся в приватный бакет; этот скрипт закрывает
 * исторические.
 *
 * Безопасность переноса:
 *  - копируем объект в приватный бакет ДО смены accessLevel в БД;
 *  - публичную копию удаляем ПОСЛЕДНЕЙ (если удаление упало — повторный запуск
 *    доберёт остаток: скрипт идемпотентен);
 *  - НЕ трогаем файл, если он одновременно используется как обложка
 *    (coverImageId) — там нужна публичность; такой кейс логируется и пропускается.
 *
 * Запуск (из каталога apps/api, переменные окружения должны быть заданы —
 * DATABASE_URL, S3_*):
 *   ts-node scripts/migrate-lesson-attachments-to-private.ts
 * В проде — внутри контейнера api, где ts-node и env уже есть:
 *   docker compose -f docker-compose.prod.yml --env-file deploy/.env.prod \
 *     exec api ts-node scripts/migrate-lesson-attachments-to-private.ts
 *
 * Скрипт ничего не делает (и сообщает об этом), если S3_PRIVATE_BUCKET не задан.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { FileAccessLevel, PrismaClient } from "@prisma/client";

// Локально подхватываем корневой .env монорепы (в проде переменные уже в env).
loadEnv({ path: resolve(__dirname, "../../../.env") });

type StoredVariant = { storageKey?: unknown };

function variantStorageKeys(variants: unknown): string[] {
  if (!variants || typeof variants !== "object" || Array.isArray(variants)) {
    return [];
  }
  return Object.values(variants as Record<string, StoredVariant>)
    .map((variant) => (typeof variant?.storageKey === "string" ? variant.storageKey : null))
    .filter((key): key is string => Boolean(key));
}

async function objectExists(client: S3Client, bucket: string, key: string): Promise<boolean> {
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "ru-1";
  const publicBucket = process.env.S3_BUCKET;
  const privateBucket = process.env.S3_PRIVATE_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

  if (!privateBucket) {
    console.log("S3_PRIVATE_BUCKET не задан — приватный бакет не настроен, миграция не требуется. Выходим.");
    return;
  }
  if (!endpoint || !publicBucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Не заданы обязательные S3-переменные (S3_ENDPOINT/S3_BUCKET/S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY).",
    );
  }

  const prisma = new PrismaClient();
  const client = new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  let migrated = 0;
  let skippedCover = 0;
  let alreadyPrivate = 0;
  let publicCopiesDeleted = 0;

  try {
    // Уникальные fileId, на которые ссылаются вложения уроков.
    const attachments = await prisma.lessonAttachment.findMany({ select: { fileId: true } });
    const fileIds = Array.from(new Set(attachments.map((a) => a.fileId)));
    if (fileIds.length === 0) {
      console.log("Вложений уроков нет — мигрировать нечего.");
      return;
    }

    const assets = await prisma.fileAsset.findMany({ where: { id: { in: fileIds } } });

    for (const asset of assets) {
      const keys = Array.from(new Set([asset.storageKey, ...variantStorageKeys(asset.variants)]));

      // Защита: файл, который ещё и обложка где-либо, должен оставаться публичным.
      const [newsCover, learningCover, knowledgeCover] = await Promise.all([
        prisma.newsPost.count({ where: { coverImageId: asset.id } }),
        prisma.learningModule.count({ where: { coverImageId: asset.id } }),
        prisma.knowledgeBaseArticle.count({ where: { coverImageId: asset.id } }),
      ]);
      if (newsCover + learningCover + knowledgeCover > 0) {
        console.warn(`SKIP ${asset.id} (${asset.originalName}): файл используется как обложка — оставляем публичным.`);
        skippedCover += 1;
        continue;
      }

      if (asset.accessLevel === FileAccessLevel.public) {
        // 1) Копируем в приватный бакет.
        for (const key of keys) {
          await client.send(
            new CopyObjectCommand({
              Bucket: privateBucket,
              Key: key,
              CopySource: `/${publicBucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`,
            }),
          );
        }
        // 2) Меняем уровень доступа — теперь serve-путь берёт приватный бакет.
        await prisma.fileAsset.update({
          where: { id: asset.id },
          data: { accessLevel: FileAccessLevel.authenticated },
        });
        migrated += 1;
        console.log(`MIGRATED ${asset.id} (${asset.originalName}) → ${privateBucket}`);
      } else {
        alreadyPrivate += 1;
      }

      // 3) Удаляем публичную копию (идемпотентно: добивает остаток после
      // прерванного прогона; для уже-приватных файлов чистит возможный хвост).
      for (const key of keys) {
        if (await objectExists(client, publicBucket, key)) {
          await client.send(new DeleteObjectCommand({ Bucket: publicBucket, Key: key }));
          publicCopiesDeleted += 1;
        }
      }
    }

    console.log(
      `\nГотово. Перенесено: ${migrated}, уже приватных: ${alreadyPrivate}, ` +
        `пропущено (обложки): ${skippedCover}, удалено публичных копий: ${publicCopiesDeleted}.`,
    );
  } finally {
    client.destroy();
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Миграция вложений упала:", error);
  process.exit(1);
});
