"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import "./content-blocks/content-article.css";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { CoverImage } from "../components/CoverImage";
import "../components/cover.css";
import { AppShell } from "../components/AppShell";
import { preferredFileAssetImageUrl } from "../lib/api";
import { useCoverAssets } from "../lib/use-cover-assets";
import { collectContentBlockImageFileIds, ContentBlocks } from "./content-blocks";
import { buildKnowledgeBreadcrumbs } from "./knowledge-base-utils";
import { PageHeader } from "./shared";

type KnowledgeArticleLike = KnowledgeNode | KnowledgeArticleDetail;

type ArticleImageReadiness = {
  key: string;
  settledIds: Set<string>;
};

export function KnowledgeArticlePanel({ active, tree }: { active: KnowledgeArticleLike; tree: KnowledgeNode[] }) {
  const breadcrumbs = buildKnowledgeBreadcrumbs(tree, active);
  const coverItems = useMemo(() => [active], [active]);
  const covers = useCoverAssets(coverItems);
  const activeCover = active.coverImageId ? covers.get(active.coverImageId) : null;
  const activeCoverUrl = preferredFileAssetImageUrl(activeCover);
  const shouldReserveActiveCover = Boolean(active.coverImageId || activeCoverUrl);
  const blocks = useMemo(() => active.blocks ?? [], [active.blocks]);
  const articleImageIds = useMemo(() => {
    return Array.from(
      new Set([...(active.coverImageId ? [active.coverImageId] : []), ...collectContentBlockImageFileIds(blocks)]),
    ).sort();
  }, [active.coverImageId, blocks]);
  const articleImageIdsKey = articleImageIds.join(",");
  const articleReadinessKey = `${active.slug}:${articleImageIdsKey}`;
  const [articleReadiness, setArticleReadiness] = useState<ArticleImageReadiness>({
    key: articleReadinessKey,
    settledIds: new Set(),
  });
  const settledArticleImageIds =
    articleReadiness.key === articleReadinessKey ? articleReadiness.settledIds : new Set<string>();
  const isArticleReady =
    articleImageIds.length === 0 || articleImageIds.every((imageId) => settledArticleImageIds.has(imageId));
  const markArticleImageSettled = useCallback(
    (fileId: string) => {
      setArticleReadiness((current) => {
        const currentSet = current.key === articleReadinessKey ? current.settledIds : new Set<string>();
        if (currentSet.has(fileId)) {
          return current.key === articleReadinessKey ? current : { key: articleReadinessKey, settledIds: currentSet };
        }
        const next = new Set(currentSet);
        next.add(fileId);
        return { key: articleReadinessKey, settledIds: next };
      });
    },
    [articleReadinessKey],
  );

  return (
    <>
      <div className="knowledge-content-head">
        <div className="knowledge-title-row">
          <div>
            {breadcrumbs.length > 0 ? (
              <p className="knowledge-breadcrumbs">
                {breadcrumbs.map((crumb, index) => (
                  <span key={crumb.slug}>
                    {index > 0 ? " / " : ""}
                    <Link href={`/knowledge-base/${crumb.slug}`}>{crumb.title}</Link>
                  </span>
                ))}
              </p>
            ) : null}
            <h1>
              {active.title}
              {active.subtitle ? <span> · {active.subtitle}</span> : null}
            </h1>
          </div>
        </div>
      </div>

      <div className={`knowledge-article-loader ${isArticleReady ? "is-ready" : "is-loading"}`} key={active.slug}>
        <div aria-hidden={!isArticleReady || undefined} className="knowledge-article-ready-content">
          {shouldReserveActiveCover ? (
            <div className="knowledge-article-shell content-fade-in">
              <figure className="knowledge-cover">
                {activeCoverUrl ? (
                  <CoverImage
                    alt={active.title}
                    src={activeCoverUrl}
                    eager
                    onLoadSettled={() => {
                      if (active.coverImageId) markArticleImageSettled(active.coverImageId);
                    }}
                    sizes="(max-width: 1024px) 100vw, 800px"
                  />
                ) : (
                  <span className="cover-skeleton" aria-hidden="true" />
                )}
              </figure>
              <KnowledgeArticleBody blocks={blocks} onImageLoadSettled={markArticleImageSettled} />
            </div>
          ) : (
            <KnowledgeArticleBody blocks={blocks} onImageLoadSettled={markArticleImageSettled} compact />
          )}
        </div>
        {!isArticleReady ? <KnowledgeArticleSkeleton /> : null}
      </div>
    </>
  );
}

function KnowledgeArticleBody({
  blocks,
  compact,
  onImageLoadSettled,
}: {
  blocks: KnowledgeArticleLike["blocks"];
  compact?: boolean;
  onImageLoadSettled: (fileId: string) => void;
}) {
  const className = compact
    ? "knowledge-article-card content-article content-fade-in"
    : "knowledge-article-card content-article";

  return (
    <article className={className}>
      {(blocks ?? []).length > 0 ? (
        <ContentBlocks blocks={blocks ?? []} onImageLoadSettled={onImageLoadSettled} variant="knowledge" />
      ) : (
        <p className="page-subtitle">Описание появится после наполнения материала.</p>
      )}
    </article>
  );
}

export function KnowledgeArticleSkeleton() {
  return (
    <div className="knowledge-article-skeleton" aria-hidden="true">
      <div className="knowledge-cover">
        <span className="cover-skeleton" />
      </div>
      <div className="knowledge-article-card content-article">
        <div className="page-skeleton-bar w-3-4" />
        <div className="page-skeleton-bar w-2-3" />
        <div className="page-skeleton-bar w-full" />
        <div className="page-skeleton-bar w-full" />
        <div className="page-skeleton-bar w-1-2" />
      </div>
    </div>
  );
}

export function KnowledgeArticleLoadingState() {
  return (
    <AppShell>
      <section className="page">
        <PageHeader title="База знаний" />
        <div className="page-skeleton-body page-skeleton-article" aria-busy="true">
          <div className="page-skeleton-bar w-3-4" />
          <div className="page-skeleton-bar w-2-3" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-1-2" />
        </div>
      </section>
    </AppShell>
  );
}
