"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { preferredFileAssetMediaUrl, type FileAsset } from "../../lib/api";
import type { VideoPlayerProps, VideoPlayerSource } from "./VideoPlayer";
import "./media-block.css";

const DynamicVideoPlayer = dynamic<VideoPlayerProps>(
  () => import("./VideoPlayer").then((module) => module.VideoPlayer),
  {
    ssr: false,
    loading: () => (
      <div className="video-fallback" aria-busy="true">
        <p className="video-fallback-text">Плеер загружается...</p>
      </div>
    ),
  },
);

export function ImageBlock({
  asset,
  assetsLoading,
  altText,
  caption,
  fileId,
  onImageLoadSettled,
}: {
  asset: FileAsset | undefined;
  assetsLoading: boolean;
  altText?: string;
  caption?: string;
  fileId: string;
  onImageLoadSettled?: (fileId: string) => void;
}) {
  useEffect(() => {
    if (!assetsLoading && !asset?.publicUrl) {
      onImageLoadSettled?.(fileId);
    }
  }, [asset?.publicUrl, assetsLoading, fileId, onImageLoadSettled]);

  return (
    <figure className="media-block">
      {asset?.publicUrl ? (
        <img
          alt={altText ?? asset.originalName}
          onError={() => onImageLoadSettled?.(fileId)}
          onLoad={() => onImageLoadSettled?.(fileId)}
          src={asset.publicUrl}
        />
      ) : (
        <MissingAsset />
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

export function MissingAsset() {
  return <p className="page-subtitle">Файл недоступен.</p>;
}

export function VideoBlock({ asset, caption }: { asset: FileAsset | null | undefined; caption?: string }) {
  // Готовые перекодированные ренишены (H.264/AAC MP4, несколько разрешений) —
  // надёжно играют во всех браузерах и дают выбор качества. Пока они не готовы,
  // отдаём оригинал (web-safe MP4 заиграет сразу; HEVC/.mov подхватится, как
  // только фоновый транскодер достроит ренишены).
  const renditions = asset?.videoRenditions;
  const renditionSources: VideoPlayerSource[] =
    renditions?.status === "ready"
      ? renditions.sources
          .filter((source): source is typeof source & { src: string } => Boolean(source.src))
          .map((source) => ({
            src: source.src,
            type: source.type || "video/mp4",
            width: source.width || undefined,
            height: source.height || undefined,
          }))
      : [];

  const fallbackUrl = asset?.streamUrl ?? asset?.publicUrl ?? asset?.downloadUrl ?? null;
  const sources: VideoPlayerSource[] =
    renditionSources.length > 0
      ? renditionSources
      : fallbackUrl
        ? [{ src: fallbackUrl, type: asset?.mimeType || "video/mp4" }]
        : [];

  const processing = sources.length === 0 && (renditions?.status === "pending" || renditions?.status === "processing");

  return (
    <figure className="media-block">
      {sources.length === 0 ? (
        processing ? (
          <div className="video-fallback">
            <p className="video-fallback-text">Видео обрабатывается — версия для воспроизведения скоро появится.</p>
          </div>
        ) : (
          <MissingAsset />
        )
      ) : (
        <div className="video-player">
          <DynamicVideoPlayer sources={sources} title={asset?.originalName} />
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
