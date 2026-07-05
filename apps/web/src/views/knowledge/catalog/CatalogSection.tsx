"use client";

// Editorial-секция категории на витрине: архивная линейка сверху, водяной
// индексный номер, иконка, заголовок-ссылка и сетка карточек-образцов.

import Link from "next/link";
import { useMemo, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { preferredFileAssetImageUrl, type FileAsset } from "../../../lib/api";
import { pluralizeRu } from "../../shared";
import { knowledgeDisplayIconForNode } from "../knowledge-icons";
import { MaterialCard } from "./MaterialCard";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function CatalogSection({
  category,
  codes,
  covers,
}: {
  category: KnowledgeNode;
  codes: Map<string, string>;
  covers: Map<string, FileAsset>;
}) {
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInView = useInView(gridRef, { once: true, amount: 0.12 });
  const Icon = knowledgeDisplayIconForNode(category, 0);
  const code = codes.get(category.slug);
  // Категория без детей — сама себе материал: показываем её единственной карточкой.
  const items = useMemo(
    () => ((category.children ?? []).length > 0 ? (category.children ?? []) : [category]),
    [category],
  );
  const materialCount = items.length;

  return (
    <section className="knowledge-catalog-section" data-catalog-slug={category.slug} id={`razdel-${category.slug}`}>
      <span aria-hidden="true" className="knowledge-catalog-section-watermark">
        {code}
      </span>
      <header className="knowledge-catalog-section-head">
        <div className="knowledge-catalog-section-heading">
          <span aria-hidden="true" className="knowledge-catalog-section-icon">
            <Icon size={20} strokeWidth={2} />
          </span>
          <div>
            <p className="knowledge-catalog-section-kicker">
              Раздел {code} · {materialCount} {pluralizeRu(materialCount, "материал", "материала", "материалов")}
            </p>
            <h2 className="knowledge-catalog-section-title">{category.title}</h2>
            {category.subtitle ? <p className="knowledge-catalog-section-subtitle">{category.subtitle}</p> : null}
          </div>
        </div>
        <Link className="knowledge-catalog-section-open" href={`/knowledge-base/${category.slug}`}>
          Открыть раздел
          <ArrowRight aria-hidden="true" size={15} strokeWidth={2.4} />
        </Link>
      </header>
      <motion.div
        animate={reducedMotion || gridInView ? "visible" : "hidden"}
        className="knowledge-catalog-grid"
        initial={reducedMotion ? false : "hidden"}
        ref={gridRef}
        variants={gridVariants}
      >
        {items.map((node) => (
          <motion.div key={node.id} variants={cardVariants}>
            <MaterialCard
              coverUrl={node.coverImageId ? preferredFileAssetImageUrl(covers.get(node.coverImageId)) : null}
              depth={node === category ? 0 : 1}
              indexCode={codes.get(node.slug)}
              node={node}
            />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
