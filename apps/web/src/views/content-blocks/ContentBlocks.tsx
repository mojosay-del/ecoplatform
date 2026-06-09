"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { AudioMessagePlayer } from "../../components/AudioMessagePlayer";
import { api, preferredFileAssetMediaUrl, type FileAsset } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { sanitizeParagraphHtml } from "../../lib/sanitize-html";
import { MatchingPlayer, type MatchingPayload } from "./MatchingPlayer";
import { VideoPlayer, type VideoPlayerSource } from "./VideoPlayer";

// Известные типы блоков из shared/content-blocks. Используем минимальные
// shape-типы вместо BaseContentBlock — здесь только то, что реально рендерим.
type RenderableBlock =
  | { type: "heading" | "subheading"; payload: { text: string } }
  | { type: "paragraph"; payload: { html: string } }
  | { type: "image"; payload: { fileId: string; caption?: string; altText?: string } }
  | { type: "gallery"; payload: { images: Array<{ fileId: string; caption?: string; altText?: string }> } }
  | { type: "video"; payload: { fileId?: string; caption?: string } }
  | { type: "audio"; payload: { fileId: string; episodeTitle?: string; caption?: string; durationSeconds?: number } }
  | { type: "file"; payload: { fileId: string; displayName: string; description?: string } }
  | { type: "checklist"; payload: { title: string; style: string; items: string[] } }
  | {
      type: "image_checklist";
      payload: {
        title: string;
        style: string;
        image: { fileId: string; caption?: string; altText?: string };
        items: string[];
      };
    }
  | { type: string; payload: Record<string, unknown> };

export function ContentBlocks({
  blocks,
  onImageLoadSettled,
}: {
  blocks: RenderableBlock[];
  onImageLoadSettled?: (fileId: string) => void;
}) {
  const { assets, isLoading } = useFileAssets(blocks);

  return (
    <div className="content-blocks">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return (
            <h2 className="content-block-heading" key={index}>
              <HeadingIcon kind="heading" />
              <span>{(block.payload as { text: string }).text}</span>
            </h2>
          );
        }
        if (block.type === "subheading") {
          return (
            <h3 className="content-block-heading is-subheading" key={index}>
              <HeadingIcon kind="subheading" />
              <span>{(block.payload as { text: string }).text}</span>
            </h3>
          );
        }
        if (block.type === "paragraph") {
          const html = (block.payload as { html: string }).html;
          return (
            <div
              className="rendered-html"
              key={index}
              dangerouslySetInnerHTML={{ __html: sanitizeParagraphHtml(html) }}
            />
          );
        }
        if (block.type === "image") {
          const payload = block.payload as { fileId: string; caption?: string; altText?: string };
          return (
            <ImageBlock
              asset={assets.get(payload.fileId)}
              assetsLoading={isLoading}
              altText={payload.altText}
              caption={payload.caption}
              fileId={payload.fileId}
              key={index}
              onImageLoadSettled={onImageLoadSettled}
            />
          );
        }
        if (block.type === "gallery") {
          const payload = block.payload as { images: Array<{ fileId: string; caption?: string; altText?: string }> };
          return (
            <div className="gallery-block" key={index}>
              {payload.images.map((image, imageIndex) => (
                <ImageBlock
                  asset={assets.get(image.fileId)}
                  assetsLoading={isLoading}
                  altText={image.altText}
                  caption={image.caption}
                  fileId={image.fileId}
                  key={`${image.fileId}-${imageIndex}`}
                  onImageLoadSettled={onImageLoadSettled}
                />
              ))}
            </div>
          );
        }
        if (block.type === "video") {
          const payload = block.payload as { fileId?: string; caption?: string };
          const asset = payload.fileId ? assets.get(payload.fileId) : null;
          return <VideoBlock asset={asset} caption={payload.caption} key={index} />;
        }
        if (block.type === "audio") {
          const payload = block.payload as {
            fileId: string;
            episodeTitle?: string;
            caption?: string;
            durationSeconds?: number;
          };
          const asset = assets.get(payload.fileId);
          return (
            <AudioMessagePlayer
              caption={payload.caption}
              durationSeconds={payload.durationSeconds}
              key={index}
              sourceUrl={preferredFileAssetMediaUrl(asset)}
              title={payload.episodeTitle}
            />
          );
        }
        if (block.type === "file") {
          const payload = block.payload as { fileId: string; displayName: string; description?: string };
          const asset = assets.get(payload.fileId);
          return (
            <div className="file-block" key={index}>
              <div>
                <strong>{payload.displayName}</strong>
                {payload.description ? <p>{payload.description}</p> : null}
              </div>
              {asset?.publicUrl ? (
                <a className="button secondary" href={asset.publicUrl} rel="noreferrer" target="_blank">
                  Скачать
                </a>
              ) : (
                <MissingAsset />
              )}
            </div>
          );
        }
        if (block.type === "checklist") {
          const payload = block.payload as { title: string; style: string; items: string[] };
          return (
            <div className={`checklist-block checklist-${payload.style}`} key={index}>
              <h3>{payload.title}</h3>
              <ul>
                {payload.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        }
        if (block.type === "image_checklist") {
          const payload = block.payload as {
            title: string;
            style: string;
            image: { fileId: string; caption?: string; altText?: string };
            items: string[];
          };
          return (
            <div className="image-checklist-block" key={index}>
              <ImageBlock
                asset={assets.get(payload.image.fileId)}
                assetsLoading={isLoading}
                altText={payload.image.altText}
                caption={payload.image.caption}
                fileId={payload.image.fileId}
                onImageLoadSettled={onImageLoadSettled}
              />
              <div className={`checklist-block checklist-${payload.style}`}>
                <h3>{payload.title}</h3>
                <ul>
                  {payload.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          );
        }
        if (block.type === "quiz") {
          return <QuizPlayer key={index} payload={block.payload as unknown as QuizPayload} />;
        }
        if (block.type === "matching") {
          return <MatchingPlayer key={index} payload={block.payload as unknown as MatchingPayload} />;
        }
        return null;
      })}
    </div>
  );
}

function HeadingIcon({ kind }: { kind: "heading" | "subheading" }) {
  if (kind === "subheading") {
    return (
      <svg className="content-block-heading-icon is-subheading" viewBox="0 0 26 26" aria-hidden="true">
        <path d="M6.5 5.5h9.4l4.6 4.6v10.4H8.5c-1.1 0-2-.9-2-2z" />
        <path d="M15.9 5.7v4.5h4.4M10.3 13.6h7M10.3 17h5.2" fill="none" />
      </svg>
    );
  }

  return (
    <svg className="content-block-heading-icon" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M7 6.5h11.4c2.2 0 4 1.8 4 4v11H11c-2.2 0-4-1.8-4-4z" />
      <path d="M11 12h7.2M11 16.4h5.2" fill="none" />
    </svg>
  );
}

function useFileAssets(blocks: RenderableBlock[]) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const [resolvedIdsKey, setResolvedIdsKey] = useState("");
  const ids = useMemo(() => collectFileIds(blocks), [blocks]);
  const idsKey = ids.join(",");
  const isLoading = ids.length > 0 && resolvedIdsKey !== idsKey;

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      setResolvedIdsKey(idsKey);
      return;
    }

    let isActive = true;
    setResolvedIdsKey("");
    api.files
      .listByIds(ids)
      .then((result) => {
        if (!isActive) return;
        setAssets(new Map(result.map((asset) => [asset.id, asset])));
      })
      .catch(() => {
        if (!isActive) return;
        setAssets(new Map());
      })
      .finally(() => {
        if (isActive) setResolvedIdsKey(idsKey);
      });

    return () => {
      isActive = false;
    };
  }, [ids.length, idsKey, token]);

  return { assets, isLoading };
}

function collectFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (
      typeof payload.image === "object" &&
      payload.image &&
      "fileId" in payload.image &&
      typeof payload.image.fileId === "string"
    ) {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}

export function collectContentBlockImageFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (block.type === "image" && typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (block.type === "gallery" && Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (
      block.type === "image_checklist" &&
      typeof payload.image === "object" &&
      payload.image &&
      "fileId" in payload.image &&
      typeof payload.image.fileId === "string"
    ) {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}

function ImageBlock({
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

function MissingAsset() {
  return <p className="page-subtitle">Файл недоступен.</p>;
}

function VideoBlock({ asset, caption }: { asset: FileAsset | null | undefined; caption?: string }) {
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
          <VideoPlayer sources={sources} title={asset?.originalName} />
        </div>
      )}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

// --- Интерактивные блоки для ученика (проверка на клиенте) ------------------

type QuizPayload = {
  question: string;
  multiple?: boolean;
  options: Array<{ text: string; correct: boolean }>;
  explanation?: string;
};

function QuizPlayer({ payload }: { payload: QuizPayload }) {
  const options = payload.options ?? [];
  const multiple = Boolean(payload.multiple);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);

  function toggle(index: number) {
    setChecked(false);
    setSelected((prev) => {
      if (multiple) return prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index];
      return [index];
    });
  }

  const isCorrect = useMemo(() => {
    const correct = options.map((option, index) => (option.correct ? index : -1)).filter((i) => i >= 0);
    return correct.length === selected.length && correct.every((i) => selected.includes(i));
  }, [options, selected]);

  return (
    <div className="quiz-block">
      <div className="quiz-head">
        <span className="quiz-badge">{multiple ? "Несколько ответов" : "Один ответ"}</span>
      </div>
      <p className="quiz-question">{payload.question}</p>
      <div className="quiz-options" role="group" aria-label="Варианты ответа">
        {options.map((option, index) => {
          const isSelected = selected.includes(index);
          let state = "";
          if (checked) {
            if (option.correct) state = "is-correct";
            else if (isSelected) state = "is-wrong";
          } else if (isSelected) {
            state = "is-selected";
          }
          const showCheck = (checked && option.correct) || (!checked && isSelected);
          const showCross = checked && !option.correct && isSelected;
          return (
            <button
              type="button"
              key={index}
              className={`quiz-option ${state}`}
              onClick={() => toggle(index)}
              aria-pressed={isSelected}
            >
              <span className={`quiz-option-marker${multiple ? " is-multiple" : ""}`} aria-hidden>
                {showCheck ? <Check size={14} strokeWidth={3} /> : showCross ? <X size={14} strokeWidth={3} /> : null}
              </span>
              <span className="quiz-option-text">{option.text}</span>
            </button>
          );
        })}
      </div>
      <div className="quiz-actions">
        <button
          className="button quiz-check"
          type="button"
          disabled={selected.length === 0}
          onClick={() => setChecked(true)}
        >
          Проверить
        </button>
        {checked ? (
          <span className={`quiz-verdict ${isCorrect ? "is-correct" : "is-wrong"}`} role="status">
            <span className="quiz-verdict-icon" aria-hidden>
              {isCorrect ? <Check size={15} strokeWidth={3} /> : <X size={15} strokeWidth={3} />}
            </span>
            {isCorrect ? "Верно!" : "Не совсем — попробуйте ещё раз"}
          </span>
        ) : null}
      </div>
      {checked && payload.explanation ? <p className="quiz-explanation">{payload.explanation}</p> : null}
    </div>
  );
}
