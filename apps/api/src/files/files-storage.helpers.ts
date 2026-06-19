import { BadRequestException, Logger } from "@nestjs/common";
import { GetObjectCommand, HeadBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileAccessLevel, type FileAsset } from "@prisma/client";
import { downloadContentDisposition } from "./files-validation.helpers";

const logger = new Logger("FilesStorage");

export const S3_UNAVAILABLE_MESSAGE = "Файловое хранилище временно недоступно. Попробуйте ещё раз через минуту.";

function isPlaceholderS3Value(value: string) {
  return value.startsWith("replace-with-");
}

function readPrivateBucket(): string | null {
  const bucket = process.env.S3_PRIVATE_BUCKET;
  if (!bucket || isPlaceholderS3Value(bucket)) {
    return null;
  }
  return bucket;
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
    privateBucket: readPrivateBucket(),
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
    privateBucketConfigured: Boolean(config.privateBucket),
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
    await Promise.all(
      [config.bucket, config.privateBucket]
        .filter((bucket): bucket is string => Boolean(bucket))
        .map((bucket) =>
          config.client.send(new HeadBucketCommand({ Bucket: bucket }), {
            abortSignal: abortController.signal,
          }),
        ),
    );
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

// Бакет, в котором ФИЗИЧЕСКИ лежит объект данного уровня доступа: public — в
// обычном public-read бакете, остальное — только в приватном.
// Единая точка истины для upload / presign / transcode — они обязаны совпадать.
export function bucketForAccessLevel(accessLevel: FileAccessLevel, publicBucket: string): string {
  if (accessLevel === FileAccessLevel.public) {
    return publicBucket;
  }
  const bucket = readPrivateBucket();
  if (!bucket) {
    throw new BadRequestException("Приватный S3-бакет не настроен.");
  }
  return bucket;
}

export function bucketForObjectDeletion(accessLevel: FileAccessLevel, publicBucket: string): string {
  if (accessLevel === FileAccessLevel.public) {
    return publicBucket;
  }

  // До fail-closed приватные файлы при отсутствии S3_PRIVATE_BUCKET фактически
  // попадали в public-бакет. Для удаления это безопасный legacy fallback: URL мы
  // не выдаём, а старые объекты не оставляем висеть навсегда.
  return readPrivateBucket() ?? publicBucket;
}

/**
 * Считает ссылку для скачивания пачки файлов с учётом уровня доступа:
 *  - public → прямая публичная ссылка (как раньше, кешируется CDN);
 *  - не public + настроен приватный бакет → presigned GET на ttlSeconds;
 *  - не public + приватный бакет НЕ настроен → null (fail-closed);
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
  const bucket = needsPrivate ? config?.privateBucket : null;

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
        urls.set(asset.id, null);
        continue;
      }
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: asset.storageKey,
        ...(options.inline ? {} : { ResponseContentDisposition: downloadContentDisposition(asset.originalName) }),
      });
      try {
        urls.set(asset.id, await getSignedUrl(config.client, command, { expiresIn: ttlSeconds }));
      } catch (error) {
        logger.warn(`S3 presign failed: ${externalStorageErrorCode(error)}`);
        urls.set(asset.id, null);
      }
    }
  } finally {
    // getS3Config() создаёт клиента заново на каждый вызов — закрываем его,
    // чтобы не накапливать дескрипторы пула соединений.
    config?.client.destroy();
  }

  return urls;
}

export function externalStorageErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "unknown";
  }
  const candidate = error as { code?: unknown; name?: unknown; $metadata?: { httpStatusCode?: unknown } };
  const code = candidate.code ?? candidate.name;
  const status = candidate.$metadata?.httpStatusCode;
  return [code ? String(code) : "unknown", status ? `status=${String(status)}` : null].filter(Boolean).join(" ");
}
