"use client";

// Результаты поиска по реестру: карточки-документы с серверными сниппетами,
// подсветкой совпадения и категорией-кикером (путь из дерева).

import { motion, useReducedMotion } from "motion/react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { buildDocumentationIndexCodes } from "../documentation-utils";
import { DocumentCard, DocumentCardSkeleton } from "./DocumentCard";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function RegistrySearchResults({
  loading,
  onResetSearch,
  onDownload,
  query,
  results,
  tree,
}: {
  loading: boolean;
  onResetSearch: () => void;
  onDownload: (node: DocumentationNode) => void;
  query: string;
  results: DocumentationNode[];
  tree: DocumentationNode[];
}) {
  const reducedMotion = useReducedMotion();
  const codes = buildDocumentationIndexCodes(tree);

  return (
    <section className="doc-search-results" aria-live="polite">
      <header className="doc-search-results-head">
        <p className="doc-search-results-kicker">Поиск по реестру</p>
        <h2 className="doc-search-results-title">{loading ? "Ищем документы…" : `Найдено: ${results.length}`}</h2>
      </header>
      {loading ? (
        <div className="doc-grid" aria-busy="true">
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
          <DocumentCardSkeleton />
        </div>
      ) : results.length === 0 ? (
        <div className="doc-empty-state">
          <p>По запросу «{query}» документов не нашлось. Попробуйте другое слово — например, из подсказок поиска.</p>
          <button type="button" className="doc-empty-action" onClick={onResetSearch}>
            Вернуться в реестр
          </button>
        </div>
      ) : (
        <motion.div
          animate="visible"
          className="doc-grid"
          initial={reducedMotion ? false : "hidden"}
          variants={gridVariants}
        >
          {results.map((node) => (
            <motion.div key={node.id} variants={cardVariants}>
              <DocumentCard
                highlightQuery={query}
                indexCode={codes.get(node.slug)}
                node={node}
                onDownload={onDownload}
                onNavigate={onResetSearch}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}
