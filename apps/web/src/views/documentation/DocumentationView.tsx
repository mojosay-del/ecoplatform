"use client";
import "../../styles/documentation.css";

// База документации: лента документов с боковой навигацией по разделам, плюс
// «Часто нужные» (закреплённые), «Недавно обновлено», поиск и фильтр по формату.
// Структурный близнец «Базы знаний», но документ — первоклассная сущность.

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { PanelRightOpen, X } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { AnimatedSearchPlaceholder } from "../../components/AnimatedSearchPlaceholder";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { DocTree, DocumentCard, EssentialsStrip, FormatFilter, RecentlyUpdated } from "./components";
import { flattenDocuments } from "./doc-helpers";
import { triggerDocumentDownload } from "./download";

const SEARCH_DEBOUNCE_MS = 2000;
const DOC_SEARCH_EXAMPLES = [
  "Договор поставки",
  "Акт приема",
  "Спецификация",
  "ТН",
  "Акт сверки",
  "Памятка",
  "Канистра",
];

function findNode(nodes: DocumentationNode[], id: string | null): DocumentationNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const inChild = findNode(node.children ?? [], id);
    if (inChild) return inChild;
  }
  return null;
}

function documentsAddedLabel(count: number): string {
  return `${count} ${pluralizeRu(count, "документ добавлен", "документа добавлено", "документов добавлено")}`;
}

export function DocumentationView() {
  const {
    data: tree,
    state,
    errorMessage,
  } = useApiQuery("doc-tree", () => api.documentation.tree(), [] as DocumentationNode[]);
  const pinned = useApiQuery("doc-pinned", () => api.documentation.pinned(), [] as DocumentationNode[]);
  const recent = useApiQuery("doc-recent", () => api.documentation.recent(8), [] as DocumentationNode[]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [format, setFormat] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<DocumentationNode[] | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  useEffect(() => {
    let active = true;
    if (debouncedQuery.length < 2) {
      setSearchResults(null);
      return;
    }
    setSearchResults(null);
    api.documentation
      .search(debouncedQuery)
      .then((results) => {
        if (active) setSearchResults(results);
      })
      .catch(() => {
        if (active) setSearchResults([]);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery]);

  const categories = useMemo(() => tree.filter((node) => node.iconType === "category"), [tree]);
  const topDocuments = useMemo(() => tree.filter((node) => node.iconType !== "category"), [tree]);
  const allDocuments = useMemo(() => flattenDocuments(tree), [tree]);

  useEffect(() => {
    if (activeId === null && categories.length > 0) {
      setActiveId(categories[0]!.id);
    }
  }, [categories, activeId]);

  const activeCategory = useMemo(() => findNode(tree, activeId), [tree, activeId]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const doc of allDocuments) {
      if (doc.file) set.add(doc.file.format);
    }
    return Array.from(set).sort();
  }, [allDocuments]);

  useEffect(() => {
    if (!navOpen) return;

    const media = window.matchMedia("(max-width: 960px)");
    if (!media.matches) {
      setNavOpen(false);
      return;
    }

    const onMediaChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setNavOpen(false);
    };

    media.addEventListener("change", onMediaChange);
    return () => media.removeEventListener("change", onMediaChange);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNavOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  const onDownload = useCallback((node: DocumentationNode) => {
    void triggerDocumentDownload(node);
  }, []);

  const resetSearch = useCallback(() => {
    setQuery("");
    setDebouncedQuery("");
    setSearchResults(null);
  }, []);

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDebouncedQuery(query.trim());
  };

  const selectCategory = useCallback(
    (node: DocumentationNode) => {
      setActiveId(node.id);
      resetSearch();
      setNavOpen(false);
    },
    [resetSearch],
  );

  const searching = debouncedQuery.length >= 2;
  const searchLoading = searching && searchResults === null;
  const hasSearchDraft = query.length > 0;
  const hasNavigation = categories.length > 0 || topDocuments.length > 0;
  const baseGrid: DocumentationNode[] = searching
    ? (searchResults ?? [])
    : activeCategory
      ? (activeCategory.children ?? []).filter((child) => child.iconType !== "category")
      : topDocuments;
  const grid = format ? baseGrid.filter((node) => node.file?.format === format) : baseGrid;
  const mobileTopbarAction = hasNavigation ? (
    <button
      className="icon-button doc-topbar-nav-trigger"
      type="button"
      onClick={() => setNavOpen(true)}
      aria-controls="documentation-nav-drawer"
      aria-expanded={navOpen}
      aria-label="Открыть разделы документации"
      title="Открыть разделы документации"
    >
      <PanelRightOpen size={20} aria-hidden="true" />
    </button>
  ) : null;

  if (state === "unauthenticated") return <AuthRequired title="Документация" />;
  if (state === "forbidden") return <AccessClosed title="Документация" />;
  if (state === "error") return <ErrorState title="Документация" message={errorMessage} />;

  return (
    <AppShell chrome={{ mobileTopbarAction }}>
      <section className="page doc-page">
        <header className="doc-header">
          <h1 className="doc-title">Документация</h1>
          <p className="doc-subtitle">Шаблоны, регламенты и отраслевые справки для работы с вторсырьём</p>
          <form className="doc-search" onSubmit={handleSearch} role="search">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Поиск по документам"
            />
            {!hasSearchDraft ? (
              <AnimatedSearchPlaceholder className="doc-search-placeholder" examples={DOC_SEARCH_EXAMPLES} />
            ) : null}
            {hasSearchDraft ? (
              <button className="doc-search-reset" type="button" aria-label="Сбросить поиск" onClick={resetSearch}>
                <X size={18} aria-hidden="true" />
              </button>
            ) : null}
          </form>
          <p className="doc-header-metric">{documentsAddedLabel(allDocuments.length)}</p>
        </header>

        {tree.length === 0 ? (
          <div className="doc-empty">
            <p className="page-subtitle">Документы пока не добавлены.</p>
          </div>
        ) : (
          <>
            <EssentialsStrip items={pinned.data} onDownload={onDownload} />
            <FormatFilter formats={formats} active={format} onChange={setFormat} />
            <div className="doc-workspace">
              <aside className="doc-nav-panel" aria-label="Навигация по документации">
                <div className="doc-nav-head">
                  <span className="doc-nav-kicker">Документация</span>
                  <h2>Разделы</h2>
                </div>
                {categories.length === 0 && topDocuments.length === 0 ? (
                  <p className="page-subtitle">Разделов пока нет.</p>
                ) : (
                  <DocTree nodes={tree} activeId={activeId} onSelect={selectCategory} />
                )}
              </aside>
              <main className="doc-content-panel">
                <div className="doc-content-head">
                  <h2>{searching ? "Результаты поиска" : activeCategory ? activeCategory.title : "Документы"}</h2>
                </div>
                {searchLoading ? (
                  <p className="page-subtitle">Ищем документы...</p>
                ) : grid.length === 0 ? (
                  <DocumentationEmptyState
                    searching={searching}
                    hasFormat={format !== null}
                    onResetFormat={() => setFormat(null)}
                    onResetSearch={resetSearch}
                  />
                ) : (
                  <div className="doc-grid">
                    {grid.map((node) => (
                      <DocumentCard key={node.id} node={node} onDownload={onDownload} />
                    ))}
                  </div>
                )}
              </main>
            </div>
            {!searching ? <RecentlyUpdated items={recent.data} /> : null}
            {navOpen ? (
              <div
                className="doc-nav-drawer-root"
                role="dialog"
                aria-modal="true"
                aria-labelledby="documentation-nav-drawer-title"
              >
                <button
                  className="doc-nav-drawer-backdrop"
                  type="button"
                  onClick={() => setNavOpen(false)}
                  aria-label="Закрыть навигацию по документации"
                />
                <aside className="doc-nav-drawer" id="documentation-nav-drawer">
                  <header className="doc-nav-drawer-head">
                    <div>
                      <span className="doc-nav-kicker">Документация</span>
                      <h2 id="documentation-nav-drawer-title">Разделы документации</h2>
                    </div>
                    <button
                      className="doc-nav-drawer-close"
                      type="button"
                      onClick={() => setNavOpen(false)}
                      aria-label="Закрыть"
                    >
                      <X size={20} aria-hidden="true" />
                    </button>
                  </header>
                  <div className="doc-nav-drawer-body">
                    <DocTree nodes={tree} activeId={activeId} onSelect={selectCategory} />
                  </div>
                </aside>
              </div>
            ) : null}
          </>
        )}
      </section>
    </AppShell>
  );
}

function DocumentationEmptyState({
  hasFormat,
  onResetFormat,
  onResetSearch,
  searching,
}: {
  hasFormat: boolean;
  onResetFormat: () => void;
  onResetSearch: () => void;
  searching: boolean;
}) {
  if (searching) {
    return (
      <div className="doc-empty-state">
        <p>По этому запросу документов не нашлось. Попробуйте другое слово или сбросьте фильтр формата.</p>
        <div className="doc-empty-actions">
          <button type="button" className="doc-empty-action" onClick={onResetSearch}>
            Сбросить поиск
          </button>
          {hasFormat ? (
            <button type="button" className="doc-empty-action is-ghost" onClick={onResetFormat}>
              Показать все форматы
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="doc-empty-state">
      <p>{hasFormat ? "В этом разделе нет документов выбранного формата." : "В этом разделе пока нет документов."}</p>
      {hasFormat ? (
        <button type="button" className="doc-empty-action" onClick={onResetFormat}>
          Показать все форматы
        </button>
      ) : null}
    </div>
  );
}
