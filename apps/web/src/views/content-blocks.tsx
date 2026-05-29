"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import { useEffect, useMemo, useState } from "react";
import { api, type FileAsset } from "../lib/api";
import { useAuth } from "../lib/auth";
import { sanitizeParagraphHtml } from "../lib/sanitize-html";

// Известные типы блоков из shared/content-blocks. Используем минимальные
// shape-типы вместо BaseContentBlock — здесь только то, что реально рендерим.
type RenderableBlock =
  | { type: "heading" | "subheading"; payload: { text: string } }
  | { type: "paragraph"; payload: { html: string } }
  | { type: "image"; payload: { fileId: string; caption?: string; altText?: string } }
  | { type: "gallery"; payload: { images: Array<{ fileId: string; caption?: string; altText?: string }> } }
  | { type: "video"; payload: { rutubeUrl: string; caption?: string } }
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

export function ContentBlocks({ blocks }: { blocks: RenderableBlock[] }) {
  const assets = useFileAssets(blocks);

  return (
    <div className="content-blocks">
      {blocks.map((block, index) => {
        if (block.type === "heading") {
          return <h2 key={index}>{(block.payload as { text: string }).text}</h2>;
        }
        if (block.type === "subheading") {
          return <h3 key={index}>{(block.payload as { text: string }).text}</h3>;
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
              altText={payload.altText}
              caption={payload.caption}
              key={index}
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
                  altText={image.altText}
                  caption={image.caption}
                  key={`${image.fileId}-${imageIndex}`}
                />
              ))}
            </div>
          );
        }
        if (block.type === "video") {
          const payload = block.payload as { fileId?: string; rutubeUrl?: string; caption?: string };
          // Приоритет — собственный загруженный файл (без рекламы). Если файла
          // нет, fallback на старую rutube-ссылку для совместимости.
          const asset = payload.fileId ? assets.get(payload.fileId) : null;
          const embedUrl = payload.rutubeUrl ? rutubeEmbedUrl(payload.rutubeUrl) : null;
          return (
            <figure className="media-block" key={index}>
              {asset?.publicUrl ? (
                <video controls preload="metadata" src={asset.publicUrl} />
              ) : embedUrl ? (
                <iframe
                  allow="clipboard-write; autoplay"
                  allowFullScreen
                  src={embedUrl}
                  title={payload.caption ?? "Видео"}
                />
              ) : payload.rutubeUrl ? (
                <a className="button secondary" href={payload.rutubeUrl} rel="noreferrer" target="_blank">
                  Открыть видео
                </a>
              ) : (
                <MissingAsset />
              )}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
          );
        }
        if (block.type === "audio") {
          const payload = block.payload as { fileId: string; episodeTitle?: string; caption?: string };
          const asset = assets.get(payload.fileId);
          return (
            <figure className="media-block" key={index}>
              {payload.episodeTitle ? <h3>{payload.episodeTitle}</h3> : null}
              {asset?.publicUrl ? <audio controls src={asset.publicUrl} /> : <MissingAsset />}
              {payload.caption ? <figcaption>{payload.caption}</figcaption> : null}
            </figure>
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
                altText={payload.image.altText}
                caption={payload.image.caption}
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
        return null;
      })}
    </div>
  );
}

function useFileAssets(blocks: RenderableBlock[]) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const ids = useMemo(() => collectFileIds(blocks), [blocks]);
  const idsKey = ids.join(",");

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      return;
    }

    api.files
      .listByIds(ids)
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [ids.length, idsKey, token]);

  return assets;
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

function ImageBlock({ asset, altText, caption }: { asset: FileAsset | undefined; altText?: string; caption?: string }) {
  return (
    <figure className="media-block">
      {asset?.publicUrl ? <img alt={altText ?? asset.originalName} src={asset.publicUrl} /> : <MissingAsset />}
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}

function MissingAsset() {
  return <p className="page-subtitle">Файл недоступен.</p>;
}

function rutubeEmbedUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Строгая проверка: точный хост или его поддомен. `includes` пропускал бы
    // подделки вроде `evil-rutube.ru` / `rutube.ru.attacker.com`.
    if (host !== "rutube.ru" && !host.endsWith(".rutube.ru")) {
      return null;
    }

    const match = parsed.pathname.match(/\/video\/([a-zA-Z0-9]+)/);
    return match?.[1] ? `https://rutube.ru/play/embed/${match[1]}` : null;
  } catch {
    return null;
  }
}
