"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import { AudioMessagePlayer } from "../../components/AudioMessagePlayer";
import { preferredFileAssetMediaUrl } from "../../lib/api";
import { sanitizeParagraphHtml } from "../../lib/sanitize-html";
import { MatchingPlayer, type MatchingPayload } from "./MatchingPlayer";
import { QuizPlayer, type QuizPayload } from "./QuizPlayer";
import { useFileAssets } from "./content-block-assets";
import { ChecklistBlock, HeadingIcon } from "./content-block-checklist";
import { ImageBlock, MissingAsset, VideoBlock } from "./content-block-media";
import type { ChecklistPayload, ContentBlocksVariant, RenderableBlock } from "./content-block-types";
import "./gallery.css";

export { collectContentBlockImageFileIds } from "./content-block-assets";

export function ContentBlocks({
  blocks,
  onImageLoadSettled,
  variant = "default",
}: {
  blocks: RenderableBlock[];
  onImageLoadSettled?: (fileId: string) => void;
  variant?: ContentBlocksVariant;
}) {
  const { assets, isLoading } = useFileAssets(blocks);

  return (
    <div className={`content-blocks${variant === "knowledge" ? " content-blocks-knowledge" : ""}`}>
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
          const payload = block.payload as ChecklistPayload;
          return <ChecklistBlock key={index} payload={payload} variant={variant} />;
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
              <ChecklistBlock payload={payload} variant={variant} />
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
