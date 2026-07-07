"use client";

// Секция-раздел реестра: архивная линейка сверху, водяной реестровый номер,
// иконка, заголовок-ссылка и сетка карточек-документов со stagger-появлением.

import { useMemo, useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { pluralizeRu } from "../../shared";
import { documentationDisplayIconForNode } from "../../documentation-icons";
import { DocumentCard } from "./DocumentCard";

const EASE = [0.22, 1, 0.36, 1] as const;

const gridVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
};

export function RegistrySection({
  section,
  codes,
  format,
  onDownload,
}: {
  section: DocumentationNode;
  codes: Map<string, string>;
  format: string | null;
  onDownload: (node: DocumentationNode) => void;
}) {
  const reducedMotion = useReducedMotion();
  const gridRef = useRef<HTMLDivElement>(null);
  const gridInView = useInView(gridRef, { once: true, amount: 0.12 });
  const Icon = documentationDisplayIconForNode(section);
  const code = codes.get(section.slug);
  // Только документы-листья раздела (вложенные подразделы имеют свои секции),
  // с учётом активного фильтра формата.
  const documents = useMemo(
    () =>
      (section.children ?? [])
        .filter((child) => child.iconType !== "category")
        .filter((child) => !format || child.file?.format === format),
    [section, format],
  );
  const count = documents.length;

  if (count === 0) return null;

  return (
    <section className="doc-section" data-registry-slug={section.slug} id={`razdel-${section.slug}`}>
      <span aria-hidden="true" className="doc-section-watermark">
        {code}
      </span>
      <header className="doc-section-head">
        <div className="doc-section-heading">
          <span aria-hidden="true" className="doc-section-icon">
            <Icon size={20} strokeWidth={2} />
          </span>
          <div>
            <p className="doc-section-kicker">
              {code ? `Раздел ${code} · ` : ""}
              {count} {pluralizeRu(count, "документ", "документа", "документов")}
            </p>
            <h2 className="doc-section-title">{section.title}</h2>
            {section.subtitle ? <p className="doc-section-subtitle">{section.subtitle}</p> : null}
          </div>
        </div>
      </header>
      <motion.div
        animate={reducedMotion || gridInView ? "visible" : "hidden"}
        className="doc-grid"
        initial={reducedMotion ? false : "hidden"}
        ref={gridRef}
        variants={gridVariants}
      >
        {documents.map((node) => (
          <motion.div key={node.id} variants={cardVariants}>
            <DocumentCard indexCode={codes.get(node.slug)} node={node} onDownload={onDownload} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
