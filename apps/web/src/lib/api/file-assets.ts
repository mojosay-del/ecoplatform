export type FileAsset = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  variants: Partial<
    Record<
      "webp" | "avif",
      {
        storageKey: string;
        mimeType: string;
        sizeBytes: number;
        publicUrl: string | null;
      }
    >
  > | null;
  accessLevel: "public" | "authenticated" | "platform_private" | "conversation_private";
  publicUrl: string | null;
  // Ссылка для скачивания: для public совпадает с publicUrl, для приватных —
  // короткоживущая presigned-ссылка (или null, если файл недоступен запросившему).
  downloadUrl?: string | null;
  // Ссылка для inline-воспроизведения медиа (video/audio) в плеере — presigned
  // без attachment-расположения, чтобы играло в Safari/iOS. null для не-медиа.
  streamUrl?: string | null;
  // Перекодированные видео-копии (H.264/AAC MP4) для надёжного воспроизведения и
  // выбора качества. status: pending/processing — ещё готовится; ready — sources
  // заполнены (по убыванию высоты). null — не видео.
  videoRenditions?: {
    status: "pending" | "processing" | "ready" | "failed";
    sources: Array<{ src: string | null; width: number; height: number; type: string }>;
  } | null;
  createdAt: string;
};

export function preferredFileAssetImageUrl(asset: FileAsset | null | undefined): string | null {
  return asset?.variants?.avif?.publicUrl ?? asset?.variants?.webp?.publicUrl ?? asset?.publicUrl ?? null;
}

export function preferredFileAssetMediaUrl(asset: FileAsset | null | undefined): string | null {
  return asset?.streamUrl ?? asset?.publicUrl ?? asset?.downloadUrl ?? null;
}
