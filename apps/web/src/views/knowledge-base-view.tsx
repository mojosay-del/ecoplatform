"use client";
import "../styles/knowledge.css";

// База знаний: список статей с боковой навигацией + страница статьи.
// Структура иерархическая (parent/children), отсюда несколько небольших
// helpers по работе с деревом.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PanelRightOpen, X } from "lucide-react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { AnimatedSearchPlaceholder } from "../components/AnimatedSearchPlaceholder";
import { AppShell } from "../components/AppShell";
import { CoverImage } from "../components/CoverImage";
import { api, preferredFileAssetImageUrl } from "../lib/api";
import { queryKeys } from "../lib/query";
import { useCoverAssets } from "../lib/use-cover-assets";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, pluralizeRu, useApiQuery } from "./shared";
import { collectContentBlockImageFileIds, ContentBlocks } from "./content-blocks";
import { knowledgeDisplayIconForNode } from "./knowledge-base-icons";
import { countKnowledgeNodes } from "./knowledge-base-utils";

const SEARCH_DEBOUNCE_MS = 2000;
const KNOWLEDGE_SEARCH_EXAMPLES = [
  "Нюансы по ПВД",
  "Стрейч пленка",
  "Критерии по ПЭТ",
  "ГОСТ по картону",
  "Архив",
  "Канистра",
];

function materialsAddedLabel(count: number): string {
  return `${count} ${pluralizeRu(count, "материал добавлен", "материала добавлено", "материалов добавлено")}`;
}

export function KnowledgeBaseView() {
  const { data, state, errorMessage } = useApiQuery(
    queryKeys.knowledgeBase.tree(),
    () => api.knowledgeBase.tree(),
    [] as KnowledgeNode[],
  );

  if (state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (state === "error") {
    return <ErrorState title="База знаний" message={errorMessage} />;
  }

  return <KnowledgeBaseLayout tree={data} activeArticle={null} activeSlug={undefined} />;
}

export function KnowledgeArticleView({ slug }: { slug: string }) {
  const tree = useApiQuery(queryKeys.knowledgeBase.tree(), () => api.knowledgeBase.tree(), [] as KnowledgeNode[]);
  const article = useApiQuery<KnowledgeArticleDetail | null>(
    queryKeys.knowledgeBase.article(slug),
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
  const pathname = usePathname();
  const [materialNavOpen, setMaterialNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const active = activeArticle ?? null;
  const activeNavSlug = activeSlug ?? active?.slug;
  const breadcrumbs = active ? buildKnowledgeBreadcrumbs(tree, active) : [];
  const coverItems = useMemo(() => (active ? [active] : []), [active]);
  const covers = useCoverAssets(coverItems);
  const activeCover = active?.coverImageId ? covers.get(active.coverImageId) : null;
  const activeCoverUrl = preferredFileAssetImageUrl(activeCover);
  const materialCount = useMemo(() => countKnowledgeNodes(tree), [tree]);
  const shouldReserveActiveCover = Boolean(active?.coverImageId || activeCoverUrl);
  const articleImageIds = useMemo(() => {
    if (!active) return [];
    return Array.from(
      new Set([
        ...(active.coverImageId ? [active.coverImageId] : []),
        ...collectContentBlockImageFileIds(active.blocks ?? []),
      ]),
    ).sort();
  }, [active]);
  const articleImageIdsKey = articleImageIds.join(",");
  const [settledArticleImageIds, setSettledArticleImageIds] = useState<Set<string>>(new Set());
  const isArticleReady =
    articleImageIds.length === 0 || articleImageIds.every((imageId) => settledArticleImageIds.has(imageId));
  const markArticleImageSettled = useCallback((fileId: string) => {
    setSettledArticleImageIds((current) => {
      if (current.has(fileId)) return current;
      const next = new Set(current);
      next.add(fileId);
      return next;
    });
  }, []);

  useEffect(() => {
    setSettledArticleImageIds(new Set());
  }, [active?.slug, articleImageIdsKey]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  const searchQuery = useQuery({
    queryKey: queryKeys.knowledgeBase.search(debouncedQuery),
    queryFn: () => api.knowledgeBase.search(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
  });

  useEffect(() => {
    setMaterialNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!materialNavOpen) return;

    const media = window.matchMedia("(max-width: 1180px)");
    if (!media.matches) {
      setMaterialNavOpen(false);
      return;
    }

    function onMediaChange(event: MediaQueryListEvent) {
      if (!event.matches) setMaterialNavOpen(false);
    }

    media.addEventListener("change", onMediaChange);
    return () => media.removeEventListener("change", onMediaChange);
  }, [materialNavOpen]);

  useEffect(() => {
    if (!materialNavOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMaterialNavOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [materialNavOpen]);

  useEffect(() => {
    if (!materialNavOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [materialNavOpen]);

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
  }, []);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDebouncedQuery(query.trim());
  };

  const searching = debouncedQuery.length >= 2;
  const searchLoading = searching && searchQuery.isPending;
  const searchResults = searching ? (searchQuery.error ? [] : (searchQuery.data ?? null)) : null;
  const hasSearchDraft = query.length > 0;
  const mobileTopbarAction =
    tree.length > 0 ? (
      <button
        className="icon-button knowledge-topbar-nav-trigger"
        type="button"
        onClick={() => setMaterialNavOpen(true)}
        aria-controls="knowledge-material-nav-drawer"
        aria-expanded={materialNavOpen}
        aria-label="Открыть разделы сырья"
        title="Открыть разделы сырья"
      >
        <PanelRightOpen size={20} aria-hidden="true" />
      </button>
    ) : null;

  return (
    <AppShell chrome={{ mobileTopbarAction }}>
      <section className="page knowledge-page">
        <header className="knowledge-header">
          <h1 className="knowledge-title">База знаний по сырью</h1>
          <p className="knowledge-subtitle">Номенклатуры, требования к качеству и практические признаки вторсырья</p>
          <form className="knowledge-search" onSubmit={handleSearch} role="search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Поиск по базе знаний сырья"
            />
            {!hasSearchDraft ? (
              <AnimatedSearchPlaceholder
                className="knowledge-search-placeholder"
                examples={KNOWLEDGE_SEARCH_EXAMPLES}
              />
            ) : null}
            {hasSearchDraft ? (
              <button
                className="knowledge-search-reset"
                type="button"
                aria-label="Сбросить поиск"
                onClick={resetSearch}
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </form>
          <p className="knowledge-header-metric">{materialsAddedLabel(materialCount)}</p>
        </header>

        {tree.length === 0 ? (
          <div className="knowledge-empty">
            <p className="page-subtitle">Материалы пока не добавлены.</p>
          </div>
        ) : (
          <div className="knowledge-workspace">
            <aside className="knowledge-nav-panel" role="navigation" aria-label="Навигация по базе знаний">
              <KnowledgeNavigation tree={tree} activeSlug={activeNavSlug} showHeading onNavigate={resetSearch} />
            </aside>

            <main className="knowledge-content-panel">
              {searching ? (
                <KnowledgeSearchResults
                  loading={searchLoading}
                  results={searchResults ?? []}
                  query={debouncedQuery}
                  onResetSearch={resetSearch}
                />
              ) : !active ? (
                <KnowledgePickEmptyState />
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

                  <div
                    className={`knowledge-article-loader ${isArticleReady ? "is-ready" : "is-loading"}`}
                    key={active.slug}
                  >
                    <div aria-hidden={!isArticleReady || undefined} className="knowledge-article-ready-content">
                      {shouldReserveActiveCover ? (
                        <div className="knowledge-article-shell content-fade-in">
                          <figure className="knowledge-cover">
                            {activeCoverUrl ? (
                              <CoverImage
                                alt={activeCover?.originalName ?? active.title}
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
                          <article className="knowledge-article-card content-article">
                            {(active.blocks ?? []).length > 0 ? (
                              <ContentBlocks
                                blocks={active.blocks ?? []}
                                onImageLoadSettled={markArticleImageSettled}
                                variant="knowledge"
                              />
                            ) : (
                              <p className="page-subtitle">Описание появится после наполнения материала.</p>
                            )}
                          </article>
                        </div>
                      ) : (
                        <article className="knowledge-article-card content-article content-fade-in">
                          {(active.blocks ?? []).length > 0 ? (
                            <ContentBlocks
                              blocks={active.blocks ?? []}
                              onImageLoadSettled={markArticleImageSettled}
                              variant="knowledge"
                            />
                          ) : (
                            <p className="page-subtitle">Описание появится после наполнения материала.</p>
                          )}
                        </article>
                      )}
                    </div>
                    {!isArticleReady ? <KnowledgeArticleSkeleton /> : null}
                  </div>
                </>
              )}
            </main>
          </div>
        )}
        {materialNavOpen ? (
          <div
            className="knowledge-nav-drawer-root"
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-nav-drawer-title"
          >
            <button
              className="knowledge-nav-drawer-backdrop"
              type="button"
              onClick={() => setMaterialNavOpen(false)}
              aria-label="Закрыть навигацию по сырью"
            />
            <aside className="knowledge-nav-drawer" id="knowledge-material-nav-drawer">
              <header className="knowledge-nav-drawer-head">
                <div>
                  <span className="knowledge-nav-kicker">База знаний</span>
                  <h2 id="knowledge-nav-drawer-title">Навигация по сырью</h2>
                </div>
                <button
                  className="knowledge-nav-drawer-close"
                  type="button"
                  onClick={() => setMaterialNavOpen(false)}
                  aria-label="Закрыть"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </header>
              <div className="knowledge-nav-drawer-body">
                <KnowledgeNavigation
                  tree={tree}
                  activeSlug={activeNavSlug}
                  showHeading={false}
                  onNavigate={() => {
                    resetSearch();
                    setMaterialNavOpen(false);
                  }}
                />
              </div>
            </aside>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function KnowledgePickEmptyState() {
  return (
    <article className="knowledge-selection-empty" aria-label="Нужно выбрать группу или номенклатуру">
      <p>Нужно выбрать группу или номенклатуру</p>
    </article>
  );
}

function KnowledgeSearchResults({
  loading,
  onResetSearch,
  query,
  results,
}: {
  loading: boolean;
  onResetSearch: () => void;
  query: string;
  results: KnowledgeNode[];
}) {
  return (
    <section className="knowledge-search-results" aria-live="polite">
      <div className="knowledge-content-head">
        <div>
          <p className="knowledge-breadcrumbs">Поиск по сырью</p>
          <h1>Результаты поиска</h1>
        </div>
      </div>
      {loading ? (
        <div className="knowledge-search-grid" aria-busy="true">
          <div className="knowledge-search-skeleton">
            <div className="page-skeleton-bar w-2-3" />
            <div className="page-skeleton-bar w-full" />
          </div>
          <div className="knowledge-search-skeleton">
            <div className="page-skeleton-bar w-3-4" />
            <div className="page-skeleton-bar w-full" />
          </div>
        </div>
      ) : results.length === 0 ? (
        <div className="knowledge-empty-state">
          <p>По запросу «{query}» материалов не нашлось. Попробуйте другое слово или откройте раздел слева.</p>
          <button type="button" className="knowledge-empty-action" onClick={onResetSearch}>
            Сбросить поиск
          </button>
        </div>
      ) : (
        <div className="knowledge-search-grid">
          {results.map((node) => (
            <Link
              className="knowledge-search-card"
              href={`/knowledge-base/${node.slug}`}
              key={node.id}
              onClick={onResetSearch}
            >
              <span className="knowledge-search-card-kicker">Материал</span>
              <strong>{node.title}</strong>
              {node.subtitle ? <span>{node.subtitle}</span> : null}
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function KnowledgeArticleSkeleton() {
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

function KnowledgeNavigation({
  tree,
  activeSlug,
  onNavigate,
  showHeading,
}: {
  tree: KnowledgeNode[];
  activeSlug?: string;
  onNavigate?: () => void;
  showHeading: boolean;
}) {
  return (
    <>
      {showHeading ? (
        <div className="knowledge-nav-heading">
          <h2>Навигация по сырью</h2>
        </div>
      ) : null}
      {tree.length === 0 ? (
        <p className="page-subtitle">Статей пока нет.</p>
      ) : (
        <nav className="knowledge-nav-list" aria-label="Разделы сырья">
          {tree.map((node: KnowledgeNode) => (
            <KnowledgeNavNode key={node.id} node={node} activeSlug={activeSlug} depth={0} onNavigate={onNavigate} />
          ))}
        </nav>
      )}
    </>
  );
}

function KnowledgeNavNode({
  node,
  activeSlug,
  depth,
  onNavigate,
}: {
  node: KnowledgeNode;
  activeSlug?: string;
  depth: number;
  onNavigate?: () => void;
}) {
  const children = (node.children ?? []) as KnowledgeNode[];
  const isActive = node.slug === activeSlug;
  const hasActiveChild = children.some((child) => knowledgeNodeContainsSlug(child, activeSlug));
  const Icon = knowledgeDisplayIconForNode(node, depth);

  return (
    <div className={`knowledge-nav-group ${hasActiveChild ? "has-active-child" : ""}`}>
      <Link
        className={`knowledge-nav-link ${isActive ? "active" : ""}`}
        href={`/knowledge-base/${node.slug}`}
        onClick={onNavigate}
      >
        <span className="knowledge-nav-icon" aria-hidden="true">
          <Icon size={depth === 0 ? 17 : 15} strokeWidth={2.15} />
        </span>
        <span className="knowledge-nav-label">{node.title}</span>
      </Link>
      {children.length > 0 ? (
        <div className="knowledge-nav-children">
          {children.map((child) => (
            <KnowledgeNavNode
              activeSlug={activeSlug}
              depth={depth + 1}
              key={child.id}
              node={child}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
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
