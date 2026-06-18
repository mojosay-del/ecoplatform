"use client";
import "../../styles/documentation.css";

// База документации: лента документов с боковой навигацией по разделам, плюс
// «Часто нужные» (закреплённые), «Недавно обновлено», поиск и фильтр по формату.
// Структурный близнец «Базы знаний», но документ — первоклассная сущность.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, pluralizeRu, useApiQuery } from "../shared";
import { DocTree, DocumentCard, EssentialsStrip, FormatFilter, RecentlyUpdated } from "./components";
import { flattenDocuments } from "./doc-helpers";
import { triggerDocumentDownload } from "./download";

const SEARCH_DEBOUNCE_MS = 2000;

function findNode(nodes: DocumentationNode[], id: string | null): DocumentationNode | null {
  if (!id) return null;
  for (const node of nodes) {
    if (node.id === id) return node;
    const inChild = findNode(node.children ?? [], id);
    if (inChild) return inChild;
  }
  return null;
}

function countLabel(count: number): string {
  return `${count} ${pluralizeRu(count, "документ", "документа", "документов")}`;
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

  useEffect(() => {
    if (activeId === null && categories.length > 0) {
      setActiveId(categories[0]!.id);
    }
  }, [categories, activeId]);

  const activeCategory = useMemo(() => findNode(tree, activeId), [tree, activeId]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const doc of flattenDocuments(tree)) {
      if (doc.file) set.add(doc.file.format);
    }
    return Array.from(set).sort();
  }, [tree]);

  const onDownload = useCallback((node: DocumentationNode) => {
    void triggerDocumentDownload(node);
  }, []);

  const searching = debouncedQuery.length >= 2;
  const baseGrid: DocumentationNode[] = searching
    ? (searchResults ?? [])
    : activeCategory
      ? (activeCategory.children ?? []).filter((child) => child.iconType !== "category")
      : topDocuments;
  const grid = format ? baseGrid.filter((node) => node.file?.format === format) : baseGrid;

  if (state === "unauthenticated") return <AuthRequired title="Документация" />;
  if (state === "forbidden") return <AccessClosed title="Документация" />;
  if (state === "error") return <ErrorState title="Документация" message={errorMessage} />;

  return (
    <AppShell>
      <section className="page doc-page">
        <header className="doc-header">
          <div>
            <span className="doc-kicker">Базы знаний</span>
            <h1 className="doc-title">Документация</h1>
            <p className="doc-subtitle">Шаблоны, регламенты и отраслевые справки для работы с вторсырьём</p>
          </div>
          <label className="doc-search">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по документам…"
              aria-label="Поиск по документам"
            />
          </label>
        </header>

        {tree.length === 0 ? (
          <div className="doc-empty">
            <p className="page-subtitle">Документы пока не добавлены.</p>
          </div>
        ) : (
          <>
            {!searching ? <EssentialsStrip items={pinned.data} onDownload={onDownload} /> : null}
            {!searching ? <RecentlyUpdated items={recent.data} /> : null}
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
                  <DocTree
                    nodes={tree}
                    activeId={activeId}
                    onSelect={(node) => {
                      setActiveId(node.id);
                      setQuery("");
                    }}
                  />
                )}
              </aside>
              <main className="doc-content-panel">
                <div className="doc-content-head">
                  <h2>{searching ? "Результаты поиска" : activeCategory ? activeCategory.title : "Документы"}</h2>
                  <span className="doc-content-count">{countLabel(grid.length)}</span>
                </div>
                {grid.length === 0 ? (
                  <p className="page-subtitle">
                    {searching ? "Ничего не найдено." : "В этом разделе пока нет документов."}
                  </p>
                ) : (
                  <div className="doc-grid">
                    {grid.map((node) => (
                      <DocumentCard key={node.id} node={node} onDownload={onDownload} />
                    ))}
                  </div>
                )}
              </main>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
