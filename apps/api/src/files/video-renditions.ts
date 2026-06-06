import type { Prisma } from "@prisma/client";

// Чистые помощники для видео-ренишенов (перекодированных ffmpeg копий ролика в
// разных разрешениях). Без побочных эффектов — легко тестировать. Сам прогон
// ffmpeg и работа с S3 живут в VideoTranscodeService.

export type VideoRenditionStatus = "pending" | "processing" | "ready" | "failed";

export type StoredVideoRendition = {
  height: number;
  width: number;
  storageKey: string;
  sizeBytes: number;
};

export type VideoRenditionsData = {
  status: VideoRenditionStatus;
  renditions: StoredVideoRendition[];
  // ISO-время последнего обновления — для отладки/наблюдаемости.
  updatedAt?: string;
};

// Целевые высоты (p). Производим только те, что ≤ высоты исходника, чтобы не
// «апскейлить». H.264 в этих разрешениях играет во всех браузерах.
const TARGET_HEIGHTS = [1080, 720, 480];

function makeEven(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

export function isVideoMime(mimeType: string | null | undefined): boolean {
  return typeof mimeType === "string" && mimeType.startsWith("video/");
}

/**
 * Какие высоты ренишенов готовить для исходника данной высоты.
 * - ≥1080 → [1080, 720, 480]; 720..1079 → [720, 480]; 480..719 → [480];
 * - <480 → один ренишен высотой исходника (чётной), гарантированный H.264;
 * - неизвестная высота → дефолт 720.
 */
export function planRenditionHeights(sourceHeight: number): number[] {
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) return [720];
  const fitting = TARGET_HEIGHTS.filter((height) => height <= sourceHeight);
  if (fitting.length === 0) {
    return [Math.max(2, makeEven(sourceHeight))];
  }
  return fitting;
}

// Ширина под целевую высоту с сохранением пропорций, округлённая до чётного
// (ffmpeg/H.264 требует чётные стороны).
export function scaledWidth(sourceWidth: number, sourceHeight: number, targetHeight: number): number {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceHeight <= 0) {
    return makeEven(targetHeight * (16 / 9));
  }
  return Math.max(2, makeEven((sourceWidth / sourceHeight) * targetHeight));
}

export function serializeVideoRenditions(data: VideoRenditionsData): Prisma.InputJsonValue {
  return {
    status: data.status,
    renditions: data.renditions.map((rendition) => ({ ...rendition })),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function parseVideoRenditions(raw: Prisma.JsonValue | null | undefined): VideoRenditionsData | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const status = record.status;
  if (status !== "pending" && status !== "processing" && status !== "ready" && status !== "failed") {
    return null;
  }
  const rawList = Array.isArray(record.renditions) ? record.renditions : [];
  const renditions: StoredVideoRendition[] = [];
  for (const item of rawList) {
    if (!item || typeof item !== "object") continue;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.height === "number" &&
      typeof candidate.width === "number" &&
      typeof candidate.storageKey === "string" &&
      typeof candidate.sizeBytes === "number"
    ) {
      renditions.push({
        height: candidate.height,
        width: candidate.width,
        storageKey: candidate.storageKey,
        sizeBytes: candidate.sizeBytes,
      });
    }
  }
  return {
    status,
    renditions,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : undefined,
  };
}
