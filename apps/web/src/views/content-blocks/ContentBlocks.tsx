"use client";

// Рендер content-blocks для новостей, уроков и статей базы знаний.
// Раньше жил в DataViews.tsx; вынесен отдельно, чтобы все view (news, learning,
// knowledge-base) могли его импортировать без циркулярных ссылок.

import type { ReactNode } from "react";
import { AudioMessagePlayer } from "../../components/AudioMessagePlayer";
import { preferredFileAssetMediaUrl } from "../../lib/api";
import { MatchingPlayer } from "./MatchingPlayer";
import { QuizPlayer } from "./QuizPlayer";
import { RevealBlock } from "./RevealBlock";
import { useFileAssets } from "./content-block-assets";
import { ChecklistBlock, HeadingIcon } from "./content-block-checklist";
import { ImageBlock, MissingAsset, VideoBlock } from "./content-block-media";
import type { ChecklistPayload, ContentBlocksVariant, RenderableBlock } from "./content-block-types";
import { parseMatchingPayload, parseQuizPayload } from "./content-block-validation";
import "./gallery.css";

export { collectContentBlockImageFileIds } from "./content-block-assets";

type BlockRenderContext = {
  assets: ReturnType<typeof useFileAssets>["assets"];
  isLoading: boolean;
  variant: ContentBlocksVariant;
  onImageLoadSettled?: (fileId: string) => void;
};

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
  const ctx: BlockRenderContext = { assets, isLoading, variant, onImageLoadSettled };

  return (
    <div className={`content-blocks${variant === "knowledge" ? " content-blocks-knowledge" : ""}`}>
      {blocks.map((block, index) => {
        const content = renderBlock(block, ctx);
        // Каждый блок проявляется при скролле (см. RevealBlock). Обёртка остаётся
        // ячейкой grid-контейнера .content-blocks, поэтому отступы не плывут.
        return content ? <RevealBlock key={index}>{content}</RevealBlock> : null;
      })}
    </div>
  );
}

function renderBlock(block: RenderableBlock, ctx: BlockRenderContext): ReactNode {
  const { assets, isLoading, variant, onImageLoadSettled } = ctx;

  if (block.type === "heading") {
    return (
      <h2 className="content-block-heading">
        <HeadingIcon kind="heading" />
        <span>{(block.payload as { text: string }).text}</span>
      </h2>
    );
  }
  if (block.type === "subheading") {
    return (
      <h3 className="content-block-heading is-subheading">
        <HeadingIcon kind="subheading" />
        <span>{(block.payload as { text: string }).text}</span>
      </h3>
    );
  }
  if (block.type === "paragraph") {
    const html = (block.payload as { html: string }).html;
    // eslint-disable-next-line react/no-danger -- API отдаёт paragraph HTML после shared DOMPurify sanitizer.
    return <div className="rendered-html" dangerouslySetInnerHTML={{ __html: html }} />;
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
        onImageLoadSettled={onImageLoadSettled}
      />
    );
  }
  if (block.type === "gallery") {
    const payload = block.payload as { images: Array<{ fileId: string; caption?: string; altText?: string }> };
    return (
      <div className="gallery-block">
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
    return <VideoBlock asset={asset} caption={payload.caption} />;
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
        sourceUrl={preferredFileAssetMediaUrl(asset)}
        title={payload.episodeTitle}
      />
    );
  }
  if (block.type === "file") {
    const payload = block.payload as { fileId: string; displayName: string; description?: string };
    const asset = assets.get(payload.fileId);
    return (
      <div className="file-block">
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
    return <ChecklistBlock payload={payload} variant={variant} />;
  }
  if (block.type === "image_checklist") {
    const payload = block.payload as {
      title: string;
      style: string;
      image: { fileId: string; caption?: string; altText?: string };
      items: string[];
    };
    return (
      <div className="image-checklist-block">
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
    const parsed = parseQuizPayload(block.payload);
    return parsed.ok ? <QuizPlayer payload={parsed.payload} /> : <InvalidInteractiveBlock />;
  }
  if (block.type === "matching") {
    const parsed = parseMatchingPayload(block.payload);
    return parsed.ok ? <MatchingPlayer payload={parsed.payload} /> : <InvalidInteractiveBlock />;
  }
  return null;
}

function InvalidInteractiveBlock() {
  return (
    <p className="page-subtitle" role="status">
      Интерактивный блок временно недоступен.
    </p>
  );
}
