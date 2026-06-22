import { Prisma, type FileAsset } from "@prisma/client";
import { normalizeFileNameEncoding } from "./file-name.helpers";
import { publicUrl } from "./files-storage.helpers";
import { parseVideoRenditions, type VideoRenditionStatus } from "./video-renditions";

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

export type FileAssetVideoSource = {
  src: string | null;
  width: number;
  height: number;
  type: string;
};

export type FileAssetVideoRenditions = {
  status: VideoRenditionStatus;
  sources: FileAssetVideoSource[];
};

export type FileAssetResponse = Omit<FileAsset, "variants" | "videoRenditions"> & {
  publicUrl: string | null;
  // Ссылка для скачивания. Для public-файлов совпадает с publicUrl; для
  // приватных — короткоживущая presigned-ссылка (или null, если S3 не настроен
  // / запросившему не положено). См. signDownloadUrls.
  downloadUrl: string | null;
  // Ссылка для inline-воспроизведения медиа (video/audio) в плеере: presigned
  // БЕЗ attachment-расположения, чтобы играло в Safari/iOS. null для не-медиа.
  // См. findManyByIds.
  streamUrl: string | null;
  variants: FileAssetImageVariants | null;
  // Перекодированные видео-копии для плеера (выбор качества). status всегда
  // присутствует для видео; sources заполняются signed-ссылками в findManyByIds/
  // upload, когда ренишены готовы. null — для не-видео.
  videoRenditions: FileAssetVideoRenditions | null;
};

export function parseImageVariants(raw: Prisma.JsonValue | null | undefined): Record<string, StoredImageVariant> {
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

function variantResponse(asset: FileAsset): FileAssetImageVariants | null {
  const parsed = parseImageVariants(asset.variants);
  const entries = Object.entries(parsed).map(([format, variant]) => [
    format,
    {
      ...variant,
      publicUrl: publicUrl(variant.storageKey, asset.accessLevel),
    },
  ]);
  return entries.length > 0 ? (Object.fromEntries(entries) as FileAssetImageVariants) : null;
}

export function toFileAssetResponse(asset: FileAsset): FileAssetResponse {
  const resolvedPublicUrl = publicUrl(asset.storageKey, asset.accessLevel);
  return {
    ...asset,
    originalName: normalizeFileNameEncoding(asset.originalName),
    publicUrl: resolvedPublicUrl,
    // Базовое значение: для public — публичная ссылка, для приватных — null.
    // Вызовы, которым нужна presigned-ссылка для приватного файла, перезаписывают
    // это поле через signDownloadUrls (см. upload / findManyByIds).
    downloadUrl: resolvedPublicUrl,
    // По умолчанию нет inline-ссылки; findManyByIds/upload проставляют её для медиа.
    streamUrl: null,
    variants: variantResponse(asset),
    // Статус сразу из БД; signed-ссылки sources докладываются в findManyByIds/upload.
    videoRenditions: videoRenditionsStatusResponse(asset),
  };
}

function videoRenditionsStatusResponse(asset: FileAsset): FileAssetVideoRenditions | null {
  const parsed = parseVideoRenditions(asset.videoRenditions);
  if (!parsed) return null;
  return { status: parsed.status, sources: [] };
}
