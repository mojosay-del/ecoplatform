import type { FileAsset } from "@prisma/client";
import { toFileAssetResponse, type FileAssetResponse, type FileAssetVideoSource } from "./files-response.helpers";
import { parseVideoRenditions } from "./video-renditions";

// Срок жизни presigned-ссылки на приватный файл. Час — достаточно, чтобы открыть
// урок и скачать материалы за сессию; по истечении фронт перезапрашивает урок,
// и доступ перепроверяется заново (истёкшая подписка ссылку уже не получит).
export const SIGNED_URL_TTL_SECONDS = 60 * 60;

type SignableFileAsset = Pick<FileAsset, "id" | "storageKey" | "accessLevel" | "originalName">;

export type FileUrlSigner = (
  assets: SignableFileAsset[],
  ttlSeconds?: number,
  options?: { inline?: boolean },
) => Promise<Map<string, string | null>>;

// Медиа, которое проигрывается в плеере прямо на странице (видео/аудио уроков).
// Для таких файлов считаем inline-ссылку (streamUrl) без attachment-расположения.
export function isPlayableMedia(mimeType: string): boolean {
  return mimeType.startsWith("video/") || mimeType.startsWith("audio/");
}

export async function buildFileAssetResponses(
  assets: FileAsset[],
  signDownloadUrls: FileUrlSigner,
): Promise<FileAssetResponse[]> {
  const signed = await signDownloadUrls(assets, SIGNED_URL_TTL_SECONDS);
  const mediaAssets = assets.filter((asset) => isPlayableMedia(asset.mimeType));
  const streamed =
    mediaAssets.length > 0
      ? await signDownloadUrls(mediaAssets, SIGNED_URL_TTL_SECONDS, { inline: true })
      : new Map<string, string | null>();
  const videoSources = await buildVideoSourcesMap(assets, signDownloadUrls);

  return assets.map((asset) => {
    const base = {
      ...toFileAssetResponse(asset),
      downloadUrl: signed.get(asset.id) ?? null,
      streamUrl: streamed.get(asset.id) ?? null,
    };
    const sources = videoSources.get(asset.id);
    if (base.videoRenditions && sources) {
      base.videoRenditions = { ...base.videoRenditions, sources };
    }
    return base;
  });
}

// Подписывает inline-ссылки на готовые видео-рендишены (по убыванию высоты -
// лучшее качество первым, как дефолт плеера). Для public-видео это прямые
// ссылки, для приватных - короткоживущие presigned (та же логика, что у
// streamUrl). Возвращает Map<assetId, sources>.
export async function buildVideoSourcesMap(
  assets: Array<Pick<FileAsset, "id" | "accessLevel" | "originalName" | "videoRenditions">>,
  signDownloadUrls: FileUrlSigner,
): Promise<Map<string, FileAssetVideoSource[]>> {
  const result = new Map<string, FileAssetVideoSource[]>();
  const synthetic: SignableFileAsset[] = [];
  const back: Array<{ synthId: string; assetId: string; width: number; height: number }> = [];

  for (const asset of assets) {
    const data = parseVideoRenditions(asset.videoRenditions);
    if (!data || data.status !== "ready" || data.renditions.length === 0) {
      continue;
    }
    const sorted = [...data.renditions].sort((a, b) => b.height - a.height);
    for (const rendition of sorted) {
      const synthId = `${asset.id}::${rendition.height}`;
      synthetic.push({
        id: synthId,
        storageKey: rendition.storageKey,
        accessLevel: asset.accessLevel,
        originalName: asset.originalName,
      });
      back.push({ synthId, assetId: asset.id, width: rendition.width, height: rendition.height });
    }
  }

  if (synthetic.length === 0) {
    return result;
  }
  const signed = await signDownloadUrls(synthetic, SIGNED_URL_TTL_SECONDS, { inline: true });
  for (const item of back) {
    const list = result.get(item.assetId) ?? [];
    list.push({ src: signed.get(item.synthId) ?? null, width: item.width, height: item.height, type: "video/mp4" });
    result.set(item.assetId, list);
  }
  return result;
}
