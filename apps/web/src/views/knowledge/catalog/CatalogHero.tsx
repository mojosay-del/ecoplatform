"use client";

// Editorial-шапка архивного каталога: надзаголовок с линейками, крупный
// заголовок, поиск и архивный штамп с числом материалов.

import { X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedSearchPlaceholder } from "../../../components/AnimatedSearchPlaceholder";
import { TourHintButton } from "../../../components/tour/TourHintButton";
import { pluralizeRu } from "../../shared";
import { KNOWLEDGE_SEARCH_EXAMPLES, type KnowledgeSearchController } from "../use-knowledge-search";

const EASE = [0.22, 1, 0.36, 1] as const;

export function CatalogHero({ materialCount, search }: { materialCount: number; search: KnowledgeSearchController }) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="knowledge-hero"
      initial={reducedMotion ? false : { opacity: 0, y: 14 }}
      transition={{ duration: 0.45, ease: EASE }}
    >
      <p className="knowledge-hero-eyebrow">Библиотека вторсырья</p>
      <div className="tour-title-row">
        <h1 className="knowledge-hero-title">База знаний по сырью</h1>
        <TourHintButton tour="knowledge-base" />
      </div>
      <p className="knowledge-hero-subtitle">Номенклатуры, требования к качеству и практические признаки вторсырья</p>
      <form className="knowledge-search" data-tour="kb-search" onSubmit={search.handleSearch} role="search">
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
          aria-label="Поиск по базе знаний сырья"
        />
        {!search.hasSearchDraft ? (
          <AnimatedSearchPlaceholder className="knowledge-search-placeholder" examples={KNOWLEDGE_SEARCH_EXAMPLES} />
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
      <p className="knowledge-hero-stamp">
        В архиве — {materialCount} {pluralizeRu(materialCount, "материал", "материала", "материалов")}
      </p>
    </motion.header>
  );
}
