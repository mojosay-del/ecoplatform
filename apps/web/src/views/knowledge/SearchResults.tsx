"use client";

// Результаты поиска по базе знаний: карточки-образцы с подсветкой совпадения
// и категорией-кикером (путь из дерева) вместо статичного «Материал».

import { motion, useReducedMotion } from "motion/react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { preferredFileAssetImageUrl, type FileAsset } from "../../lib/api";
import { MaterialCard, MaterialCardSkeleton } from "./catalog/MaterialCard";
import { buildKnowledgeBreadcrumbs, buildKnowledgeIndexCodes } from "./knowledge-utils";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function KnowledgeSearchResults({
  covers,
  loading,
  onResetSearch,
  query,
  results,
  tree,
}: {
  covers: Map<string, FileAsset>;
  loading: boolean;
  onResetSearch: () => void;
  query: string;
  results: KnowledgeNode[];
  tree: KnowledgeNode[];
}) {
  const reducedMotion = useReducedMotion();
  const codes = buildKnowledgeIndexCodes(tree);

  return (
    <section className="knowledge-search-results" aria-live="polite">
      <header className="knowledge-search-results-head">
        <p className="knowledge-search-results-kicker">Поиск по архиву</p>
        <h2 className="knowledge-search-results-title">{loading ? "Ищем материалы…" : `Найдено: ${results.length}`}</h2>
      </header>
      {loading ? (
        <div className="knowledge-catalog-grid" aria-busy="true">
          <MaterialCardSkeleton />
          <MaterialCardSkeleton />
          <MaterialCardSkeleton />
        </div>
      ) : results.length === 0 ? (
        <div className="knowledge-empty-state">
          <p>По запросу «{query}» материалов не нашлось. Попробуйте другое слово — например, из подсказок поиска.</p>
          <button type="button" className="knowledge-empty-action" onClick={onResetSearch}>
            Вернуться в каталог
          </button>
        </div>
      ) : (
        <motion.div
          animate="visible"
          className="knowledge-catalog-grid"
          initial={reducedMotion ? false : "hidden"}
          variants={gridVariants}
        >
          {results.map((node) => {
            const breadcrumbs = buildKnowledgeBreadcrumbs(tree, node);
            const kicker =
              breadcrumbs.length > 0 ? breadcrumbs.map((crumb) => crumb.title).join(" / ") : "Раздел каталога";
            return (
              <motion.div key={node.id} variants={cardVariants}>
                <MaterialCard
                  coverUrl={node.coverImageId ? preferredFileAssetImageUrl(covers.get(node.coverImageId)) : null}
                  highlightQuery={query}
                  indexCode={codes.get(node.slug)}
                  kicker={kicker}
                  node={node}
                  onNavigate={onResetSearch}
                />
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </section>
  );
}
