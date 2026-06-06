import { BadRequestException } from "@nestjs/common";
import { GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileAccessLevel, type FileAsset } from "@prisma/client";
import { downloadContentDisposition } from "./files-validation.helpers";

function isPlaceholderS3Value(value: string) {
  return value.startsWith("replace-with-");
}

export function getS3Config() {
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

export function getS3Client() {
  const config = getS3Config();
  if (!config) {
    throw new BadRequestException("S3-хранилище не настроено.");
  }

  return config;
}

export function readS3HealthConfig() {
  const config = getS3Config();
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

export async function s3PingBucket(timeoutMs: number): Promise<void> {
  const config = getS3Config();
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

function directObjectUrl(baseUrl: string, bucket: string, storageKey: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${bucket}/${storageKey}`;
}

export function publicUrl(storageKey: string, accessLevel: FileAccessLevel): string | null {
  if (accessLevel !== FileAccessLevel.public) {
    return null;
  }

  const baseUrl = process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  if (!baseUrl || !bucket) {
    return null;
  }

  return directObjectUrl(baseUrl, bucket, storageKey);
}

// Отдельный приватный бакет для непубличных файлов (вложения платных уроков).
// Если не настроен — возвращаем null, и всё работает по-старому (мягкая
// деградация: до настройки инфраструктуры файлы остаются в публичном бакете).
function privateBucket(): string | null {
  const bucket = process.env.S3_PRIVATE_BUCKET;
  if (!bucket || isPlaceholderS3Value(bucket)) {
    return null;
  }
  return bucket;
}

// Бакет, в котором ФИЗИЧЕСКИ лежит объект данного уровня доступа: public — в
// обычном public-read бакете, остальное — в приватном (если он настроен).
// Единая точка истины для upload / delete / presign — они обязаны совпадать.
export function bucketForAccessLevel(accessLevel: FileAccessLevel, publicBucket: string): string {
  if (accessLevel === FileAccessLevel.public) {
    return publicBucket;
  }
  return privateBucket() ?? publicBucket;
}

/**
 * Считает ссылку для скачивания пачки файлов с учётом уровня доступа:
 *  - public → прямая публичная ссылка (как раньше, кешируется CDN);
 *  - не public + настроен приватный бакет → presigned GET на ttlSeconds;
 *  - не public + приватный бакет НЕ настроен → fallback на прямую ссылку
 *    (объект ещё в публичном бакете, не мигрирован) — без регрессии выдачи;
 *  - S3 не настроен → null.
 * Принимает пачку, чтобы на странице урока создавать S3-клиент один раз.
 *
 * options.inline: для медиа-плеера (video/audio) presign БЕЗ
 * Content-Disposition: attachment — иначе Safari/iOS отказываются проигрывать
 * ресурс в <video>/<audio> и предлагают только скачать. Объект в S3 хранится с
 * корректным ContentType и inline-расположением, presigned-GET поддерживает
 * Range — этого достаточно для воспроизведения во всех браузерах.
 */
export async function signS3DownloadUrls(
  assets: Array<Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">>,
  ttlSeconds: number,
  options: { inline?: boolean } = {},
): Promise<Map<string, string | null>> {
  const urls = new Map<string, string | null>();
  if (assets.length === 0) {
    return urls;
  }

  const needsPrivate = assets.some((asset) => asset.accessLevel !== FileAccessLevel.public);
  const config = needsPrivate ? getS3Config() : null;
  const bucket = needsPrivate ? privateBucket() : null;

  try {
    for (const asset of assets) {
      if (asset.accessLevel === FileAccessLevel.public) {
        urls.set(asset.id, publicUrl(asset.storageKey, asset.accessLevel));
        continue;
      }
      if (!config) {
        urls.set(asset.id, null);
        continue;
      }
      if (!bucket) {
        urls.set(asset.id, directObjectUrl(config.publicBaseUrl, config.bucket, asset.storageKey));
        continue;
      }
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: asset.storageKey,
        ...(options.inline ? {} : { ResponseContentDisposition: downloadContentDisposition(asset.originalName) }),
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
