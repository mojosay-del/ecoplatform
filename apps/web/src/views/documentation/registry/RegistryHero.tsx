"use client";

// Editorial-шапка реестра: надзаголовок с линейками, крупный заголовок, живой
// поиск и штамп-печать с числом документов в реестре.

import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedSearchPlaceholder } from "../../../components/AnimatedSearchPlaceholder";
import { pluralizeRu } from "../../shared";
import { DOCUMENTATION_SEARCH_EXAMPLES, type DocumentationSearchController } from "../use-documentation-search";

const EASE = [0.22, 1, 0.36, 1] as const;

export function RegistryHero({
  documentCount,
  search,
}: {
  documentCount: number;
  search: DocumentationSearchController;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="doc-hero"
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p className="doc-hero-eyebrow">Реестр документов</p>
      <h1 className="doc-hero-title">Документация</h1>
      <p className="doc-hero-subtitle">
        Шаблоны, регламенты и отраслевые справки для работы с вторсырьём — с версиями и датами вступления в силу
      </p>
      <form className="doc-search" onSubmit={search.handleSearch} role="search">
        <input
          type="search"
          value={search.query}
          onChange={(event) => search.setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && search.hasSearchDraft) {
              event.preventDefault();
              search.resetSearch();
            }
          }}
          aria-label="Поиск по документам"
        />
        {!search.hasSearchDraft ? (
          <AnimatedSearchPlaceholder className="doc-search-placeholder" examples={DOCUMENTATION_SEARCH_EXAMPLES} />
        ) : null}
        {search.hasSearchDraft ? (
          <button className="doc-search-reset" type="button" aria-label="Сбросить поиск" onClick={search.resetSearch}>
            <X size={18} aria-hidden="true" />
          </button>
        ) : null}
      </form>
      <p className="doc-hero-stamp">
        В реестре — {documentCount} {pluralizeRu(documentCount, "документ", "документа", "документов")}
      </p>
    </motion.header>
  );
}
