"use client";

import Link from "next/link";
import type { KnowledgeNode } from "@ecoplatform/shared";

export function KnowledgePickEmptyState() {
  return (
    <article className="knowledge-selection-empty" aria-label="Нужно выбрать группу или номенклатуру">
      <p>Нужно выбрать группу или номенклатуру</p>
    </article>
  );
}

export function KnowledgeSearchResults({
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
