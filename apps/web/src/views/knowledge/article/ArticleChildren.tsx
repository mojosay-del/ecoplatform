"use client";

// Сетка подвидов на странице категории: те же карточки-«образцы», что и на витрине.

import type { KnowledgeNode } from "@ecoplatform/shared";
import { motion, useReducedMotion } from "motion/react";
import { preferredFileAssetImageUrl, type FileAsset } from "../../../lib/api";
import { MaterialCard } from "../catalog/MaterialCard";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

export function ArticleChildren({
  childrenNodes,
  codes,
  covers,
}: {
  childrenNodes: KnowledgeNode[];
  codes: Map<string, string>;
  covers: Map<string, FileAsset>;
}) {
  const reducedMotion = useReducedMotion();
  if (childrenNodes.length === 0) return null;

  return (
    <section className="knowledge-article-children">
      <h2 className="knowledge-article-children-title">В этом разделе</h2>
      <motion.div
        animate="visible"
        className="knowledge-catalog-grid"
        initial={reducedMotion ? false : "hidden"}
        variants={gridVariants}
      >
        {childrenNodes.map((node) => (
          <motion.div key={node.id} variants={cardVariants}>
            <MaterialCard
              coverUrl={node.coverImageId ? preferredFileAssetImageUrl(covers.get(node.coverImageId)) : null}
              indexCode={codes.get(node.slug)}
              node={node}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
