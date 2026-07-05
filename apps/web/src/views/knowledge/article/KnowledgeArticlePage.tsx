"use client";

// Страница материала — «лист образца»: паспорт-hero, индекс архива слева,
// текст с оглавлением справа, сетка подвидов и навигация по соседям.

import { PanelRightOpen } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { preferredFileAssetImageUrl } from "../../../lib/api";
import { useCoverAssets } from "../../../lib/use-cover-assets";
import { collectContentBlockImageFileIds, ContentBlocks } from "../../content-blocks";
import { KnowledgeNavigationDrawer } from "../KnowledgeDrawer";
import {
  buildKnowledgeBreadcrumbs,
  buildKnowledgeIndexCodes,
  estimateKnowledgeReadingMinutes,
  extractKnowledgeToc,
  findKnowledgeNeighbors,
} from "../knowledge-utils";
import { useKnowledgeMobileNav } from "../use-knowledge-mobile-nav";
import { ArticleChildren } from "./ArticleChildren";
import { ArticleHero } from "./ArticleHero";
import { ArticleNeighbors } from "./ArticleNeighbors";
import { ArticleSidebar } from "./ArticleSidebar";
import { ArticleToc, KNOWLEDGE_HEADING_ANCHOR_PREFIX } from "./ArticleToc";

type KnowledgeArticleLike = KnowledgeNode | KnowledgeArticleDetail;

export function KnowledgeArticlePage({ active, tree }: { active: KnowledgeArticleLike; tree: KnowledgeNode[] }) {
  const nav = useKnowledgeMobileNav();
  const blocks = useMemo(() => active.blocks ?? [], [active.blocks]);
  const codes = useMemo(() => buildKnowledgeIndexCodes(tree), [tree]);
  const breadcrumbs = useMemo(() => buildKnowledgeBreadcrumbs(tree, active), [tree, active]);
  const neighbors = useMemo(() => findKnowledgeNeighbors(tree, active.slug), [tree, active.slug]);
  const toc = useMemo(() => extractKnowledgeToc(blocks), [blocks]);
  const readingMinutes = useMemo(() => estimateKnowledgeReadingMinutes(blocks), [blocks]);
  const coverItems = useMemo(() => [active, ...(active.children ?? [])], [active]);
  const covers = useCoverAssets(coverItems);
  const activeCoverUrl = active.coverImageId ? preferredFileAssetImageUrl(covers.get(active.coverImageId)) : null;
  const readiness = useArticleImageReadiness(active, blocks);
  const childrenNodes = active.children ?? [];

  const mobileTopbarAction =
    tree.length > 0 ? (
      <button
        className="icon-button knowledge-topbar-nav-trigger"
        type="button"
        onClick={nav.openMaterialNav}
        aria-controls="knowledge-material-nav-drawer"
        aria-expanded={nav.materialNavOpen}
        aria-label="Открыть разделы сырья"
        title="Открыть разделы сырья"
      >
        <PanelRightOpen size={20} aria-hidden="true" />
      </button>
    ) : null;

  return (
    <AppShell chrome={{ mobileTopbarAction }}>
      <section className="page knowledge-page knowledge-article-page">
        <ArticleHero
          active={active}
          breadcrumbs={breadcrumbs}
          coverUrl={activeCoverUrl}
          indexCode={codes.get(active.slug)}
          onCoverSettled={readiness.markSettled}
          readingMinutes={readingMinutes}
        />
        <div className="knowledge-article-layout">
          <ArticleSidebar activeSlug={active.slug} codes={codes} tree={tree} />
          <div className={`knowledge-article-main${toc.length >= 3 ? " has-toc" : ""}`}>
            <div className="knowledge-article-flow" key={active.slug}>
              <div
                aria-hidden={!readiness.ready || undefined}
                className={`knowledge-article-content${readiness.ready ? " is-ready" : " is-loading"}`}
              >
                {blocks.length > 0 ? (
                  <article className="knowledge-article-card content-article">
                    <ContentBlocks
                      blocks={blocks}
                      headingAnchorPrefix={KNOWLEDGE_HEADING_ANCHOR_PREFIX}
                      onImageLoadSettled={readiness.markSettled}
                      variant="knowledge"
                    />
                  </article>
                ) : childrenNodes.length === 0 ? (
                  <article className="knowledge-article-card content-article">
                    <p className="page-subtitle">Описание появится после наполнения материала.</p>
                  </article>
                ) : null}
                <ArticleChildren childrenNodes={childrenNodes} codes={codes} covers={covers} />
                <ArticleNeighbors neighbors={neighbors} />
              </div>
              {!readiness.ready ? <ArticleContentSkeleton /> : null}
            </div>
            <ArticleToc entries={toc} />
          </div>
        </div>
        {nav.materialNavOpen ? (
          <KnowledgeNavigationDrawer
            tree={tree}
            activeSlug={active.slug}
            onClose={nav.closeMaterialNav}
            onNavigate={nav.closeMaterialNav}
          />
        ) : null}
      </section>
    </AppShell>
  );
}

// Пока обложка и картинки блоков не догрузились (или не упали), контент прикрыт
// скелетоном — исключает прыжки макета на медленной сети.
function useArticleImageReadiness(active: KnowledgeArticleLike, blocks: KnowledgeArticleLike["blocks"]) {
  const imageIds = useMemo(() => {
    return Array.from(
      new Set([
        ...(active.coverImageId ? [active.coverImageId] : []),
        ...collectContentBlockImageFileIds(blocks ?? []),
      ]),
    ).sort();
  }, [active.coverImageId, blocks]);
  const readinessKey = `${active.slug}:${imageIds.join(",")}`;
  const [state, setState] = useState<{ key: string; settledIds: Set<string> }>({
    key: readinessKey,
    settledIds: new Set(),
  });

  const settledIds = state.key === readinessKey ? state.settledIds : new Set<string>();
  const ready = imageIds.length === 0 || imageIds.every((imageId) => settledIds.has(imageId));

  const markSettled = useCallback(
    (fileId: string) => {
      setState((current) => {
        const currentSet = current.key === readinessKey ? current.settledIds : new Set<string>();
        if (currentSet.has(fileId)) {
          return current.key === readinessKey ? current : { key: readinessKey, settledIds: currentSet };
        }
        const next = new Set(currentSet);
        next.add(fileId);
        return { key: readinessKey, settledIds: next };
      });
    },
    [readinessKey],
  );

  return { markSettled, ready };
}

function ArticleContentSkeleton() {
  return (
    <div className="knowledge-article-content-skeleton" aria-hidden="true">
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
