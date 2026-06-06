"use client";

// База знаний: список статей с боковой навигацией + страница статьи.
// Структура иерархическая (parent/children), отсюда несколько небольших
// helpers по работе с деревом.

import Link from "next/link";
import { useMemo } from "react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { AppShell } from "../components/AppShell";
import { CoverImage } from "../components/CoverImage";
import { api, preferredFileAssetImageUrl } from "../lib/api";
import { useCoverAssets } from "../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "./shared";
import { ContentBlocks } from "./content-blocks";

export function KnowledgeBaseView() {
  const { data, state, errorMessage } = useApiQuery("kb-tree", () => api.knowledgeBase.tree(), [] as KnowledgeNode[]);
  const activeNode = useMemo(() => findFirstKnowledgeNode(data), [data]);

  if (state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (state === "error") {
    return <ErrorState title="База знаний" message={errorMessage} />;
  }

  return <KnowledgeBaseLayout tree={data} activeArticle={activeNode} activeSlug={activeNode?.slug} />;
}

export function KnowledgeArticleView({ slug }: { slug: string }) {
  const tree = useApiQuery("kb-tree", () => api.knowledgeBase.tree(), [] as KnowledgeNode[]);
  const article = useApiQuery<KnowledgeArticleDetail | null>(
    `kb-article:${slug}`,
    () => api.knowledgeBase.getArticle(slug),
    null,
  );

  if (tree.state === "unauthenticated" || article.state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (tree.state === "forbidden" || article.state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (tree.state === "error" || article.state === "error") {
    return <ErrorState title="База знаний" message={tree.errorMessage ?? article.errorMessage} />;
  }
  if (!article.data) {
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

  return <KnowledgeBaseLayout tree={tree.data} activeArticle={article.data} activeSlug={slug} />;
}

function KnowledgeBaseLayout({
  tree,
  activeArticle,
  activeSlug,
}: {
  tree: KnowledgeNode[];
  // Лента передаёт первый узел из дерева (KnowledgeNode без blocks), страница
  // конкретной статьи — KnowledgeArticleDetail с blocks. Внутри используем
  // только общие поля + опциональный blocks, поэтому union здесь честный.
  activeArticle?: KnowledgeNode | KnowledgeArticleDetail | null;
  activeSlug?: string;
}) {
  const fallbackActive = useMemo(() => findFirstKnowledgeNode(tree), [tree]);
  const active = activeArticle ?? fallbackActive;
  const activeChildren = (active?.children ?? []) as KnowledgeNode[];
  const breadcrumbs = active ? buildKnowledgeBreadcrumbs(tree, active) : [];
  const coverItems = useMemo(() => (active ? [active, ...((active.children ?? []) as KnowledgeNode[])] : []), [active]);
  const covers = useCoverAssets(coverItems);
  const activeCover = active?.coverImageId ? covers.get(active.coverImageId) : null;
  const activeCoverUrl = preferredFileAssetImageUrl(activeCover);

  return (
    <AppShell>
      <section className="page knowledge-page">
        <div className="knowledge-workspace">
          <aside className="knowledge-nav-panel" role="navigation" aria-label="Навигация по базе знаний">
            <div className="knowledge-nav-heading">
              <span className="knowledge-nav-kicker">База знаний</span>
              <h2>Навигация по сырью</h2>
            </div>
            {tree.length === 0 ? (
              <p className="page-subtitle">Статей пока нет.</p>
            ) : (
              <nav className="knowledge-nav-list">
                {tree.map((node: KnowledgeNode) => (
                  <KnowledgeNavNode key={node.id} node={node} activeSlug={activeSlug ?? active?.slug} />
                ))}
              </nav>
            )}
          </aside>

          <main className="knowledge-content-panel">
            {!active ? (
              <article className="knowledge-article-card">
                <p className="page-subtitle">Выберите материал в навигации слева.</p>
              </article>
            ) : (
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

                {activeCoverUrl ? (
                  <div className="knowledge-article-shell content-fade-in" key={active.slug}>
                    <figure className="knowledge-cover">
                      <CoverImage
                        alt={activeCover?.originalName ?? active.title}
                        src={activeCoverUrl}
                        eager
                        sizes="(max-width: 1024px) 100vw, 800px"
                      />
                    </figure>
                    <article className="knowledge-article-card content-article">
                      {(active.blocks ?? []).length > 0 ? (
                        <ContentBlocks blocks={active.blocks ?? []} />
                      ) : (
                        <p className="page-subtitle">Описание появится после наполнения материала.</p>
                      )}
                    </article>
                  </div>
                ) : (
                  <article className="knowledge-article-card content-article content-fade-in" key={active.slug}>
                    {(active.blocks ?? []).length > 0 ? (
                      <ContentBlocks blocks={active.blocks ?? []} />
                    ) : (
                      <p className="page-subtitle">Описание появится после наполнения материала.</p>
                    )}
                  </article>
                )}

                {activeChildren.length > 0 ? (
                  <section className="knowledge-child-section" aria-label="Материалы раздела">
                    <h2>Материалы раздела</h2>
                    <div className="knowledge-child-grid">
                      {activeChildren.map((child: KnowledgeNode) => {
                        const childCover = child.coverImageId ? covers.get(child.coverImageId) : null;
                        const childCoverUrl = preferredFileAssetImageUrl(childCover);
                        return (
                          <Link
                            className={`knowledge-child-card${childCoverUrl ? " has-cover" : ""}`}
                            href={`/knowledge-base/${child.slug}`}
                            key={child.id}
                          >
                            {childCoverUrl ? (
                              <div className="knowledge-child-card-cover">
                                <CoverImage alt="" src={childCoverUrl} sizes="(max-width: 768px) 100vw, 280px" />
                              </div>
                            ) : null}
                            <strong>{child.title}</strong>
                            {child.subtitle ? <span>{child.subtitle}</span> : null}
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </main>
        </div>
      </section>
    </AppShell>
  );
}

function KnowledgeNavNode({ node, activeSlug }: { node: KnowledgeNode; activeSlug?: string }) {
  const children = (node.children ?? []) as KnowledgeNode[];
  const isActive = node.slug === activeSlug;
  const hasActiveChild = children.some((child) => knowledgeNodeContainsSlug(child, activeSlug));

  return (
    <div className={`knowledge-nav-group ${hasActiveChild ? "has-active-child" : ""}`}>
      <Link className={`knowledge-nav-link ${isActive ? "active" : ""}`} href={`/knowledge-base/${node.slug}`}>
        <span>{node.title}</span>
      </Link>
      {children.length > 0 ? (
        <div className="knowledge-nav-children">
          {children.map((child) => (
            <KnowledgeNavNode activeSlug={activeSlug} key={child.id} node={child} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function findFirstKnowledgeNode(nodes: KnowledgeNode[]): KnowledgeNode | null {
  for (const node of nodes) {
    if ((node.blocks ?? []).length > 0 || (node.children ?? []).length === 0) {
      return node;
    }
    const child = findFirstKnowledgeNode(node.children ?? []);
    if (child) return child;
  }
  return nodes[0] ?? null;
}

function knowledgeNodeContainsSlug(node: KnowledgeNode, slug?: string): boolean {
  if (!slug) return false;
  if (node.slug === slug) return true;
  return ((node.children ?? []) as KnowledgeNode[]).some((child) => knowledgeNodeContainsSlug(child, slug));
}

function buildKnowledgeBreadcrumbs(
  nodes: KnowledgeNode[],
  active: KnowledgeNode,
): Array<{ title: string; slug: string }> {
  const path = findKnowledgePath(nodes, active.slug) ?? [];
  return path.slice(0, -1).map((node) => ({ title: node.title, slug: node.slug }));
}

function findKnowledgePath(nodes: KnowledgeNode[], slug?: string): KnowledgeNode[] | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const childPath = findKnowledgePath(node.children ?? [], slug);
    if (childPath) return [node, ...childPath];
  }
  return null;
}
