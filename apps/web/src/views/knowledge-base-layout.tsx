"use client";

import { useMemo } from "react";
import { PanelRightOpen, X } from "lucide-react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { AnimatedSearchPlaceholder } from "../components/AnimatedSearchPlaceholder";
import { AppShell } from "../components/AppShell";
import { pluralizeRu } from "./shared";
import { KnowledgeArticlePanel } from "./knowledge-base-article";
import { KnowledgeNavigationDrawer } from "./knowledge-base-drawer";
import { KnowledgeNavigation } from "./knowledge-base-navigation";
import { KnowledgePickEmptyState, KnowledgeSearchResults } from "./knowledge-base-search";
import { countKnowledgeNodes } from "./knowledge-base-utils";
import { KNOWLEDGE_SEARCH_EXAMPLES, useKnowledgeBaseSearch } from "./use-knowledge-base-search";
import { useKnowledgeMobileNav } from "./use-knowledge-mobile-nav";

function materialsAddedLabel(count: number): string {
  return `${count} ${pluralizeRu(count, "материал добавлен", "материала добавлено", "материалов добавлено")}`;
}

export function KnowledgeBaseLayout({
  tree,
  activeArticle,
  activeSlug,
}: {
  tree: KnowledgeNode[];
  activeArticle?: KnowledgeNode | KnowledgeArticleDetail | null;
  activeSlug?: string;
}) {
  const active = activeArticle ?? null;
  const activeNavSlug = activeSlug ?? active?.slug;
  const materialCount = useMemo(() => countKnowledgeNodes(tree), [tree]);
  const search = useKnowledgeBaseSearch();
  const nav = useKnowledgeMobileNav();
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
      <section className="page knowledge-page">
        <header className="knowledge-header">
          <h1 className="knowledge-title">База знаний по сырью</h1>
          <p className="knowledge-subtitle">Номенклатуры, требования к качеству и практические признаки вторсырья</p>
          <form className="knowledge-search" onSubmit={search.handleSearch} role="search">
            <input
              type="search"
              value={search.query}
              onChange={(event) => search.setQuery(event.target.value)}
              aria-label="Поиск по базе знаний сырья"
            />
            {!search.hasSearchDraft ? (
              <AnimatedSearchPlaceholder
                className="knowledge-search-placeholder"
                examples={KNOWLEDGE_SEARCH_EXAMPLES}
              />
            ) : null}
            {search.hasSearchDraft ? (
              <button
                className="knowledge-search-reset"
                type="button"
                aria-label="Сбросить поиск"
                onClick={search.resetSearch}
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
              <KnowledgeNavigation tree={tree} activeSlug={activeNavSlug} showHeading onNavigate={search.resetSearch} />
            </aside>

            <main className="knowledge-content-panel">
              {search.searching ? (
                <KnowledgeSearchResults
                  loading={search.searchLoading}
                  results={search.searchResults ?? []}
                  query={search.debouncedQuery}
                  onResetSearch={search.resetSearch}
                />
              ) : !active ? (
                <KnowledgePickEmptyState />
              ) : (
                <KnowledgeArticlePanel active={active} tree={tree} />
              )}
            </main>
          </div>
        )}
        {nav.materialNavOpen ? (
          <KnowledgeNavigationDrawer
            tree={tree}
            activeSlug={activeNavSlug}
            onClose={nav.closeMaterialNav}
            onNavigate={() => {
              search.resetSearch();
              nav.closeMaterialNav();
            }}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
