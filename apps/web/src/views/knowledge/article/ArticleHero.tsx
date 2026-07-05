"use client";

// «Паспорт материала»: индексный путь-крошки, крупный заголовок, мета-строка
// (код, время чтения, подвиды) и обложка справа с архивным фолбэком.

import Link from "next/link";
import { Clock3, Layers2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { CoverImage } from "../../../components/CoverImage";
import { pluralizeRu } from "../../shared";
import { MaterialCoverFallback } from "../catalog/MaterialCoverFallback";

const EASE = [0.22, 1, 0.36, 1] as const;

export function ArticleHero({
  active,
  breadcrumbs,
  coverUrl,
  indexCode,
  onCoverSettled,
  readingMinutes,
}: {
  active: KnowledgeNode | KnowledgeArticleDetail;
  breadcrumbs: Array<{ title: string; slug: string }>;
  coverUrl: string | null;
  indexCode?: string;
  onCoverSettled?: (fileId: string) => void;
  readingMinutes: number;
}) {
  const reducedMotion = useReducedMotion();
  const [coverState, setCoverState] = useState<"loading" | "ok" | "error">("loading");
  const childCount = (active.children ?? []).length;
  const depth = breadcrumbs.length;

  return (
    <motion.header
      animate={{ opacity: 1, y: 0 }}
      className="knowledge-passport"
      initial={reducedMotion ? false : { opacity: 0, y: 12 }}
      transition={{ duration: 0.4, ease: EASE }}
    >
      <div className="knowledge-passport-body">
        <nav aria-label="Путь по каталогу" className="knowledge-passport-path">
          <Link href="/knowledge-base">База знаний</Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.slug}>
              <span aria-hidden="true" className="knowledge-passport-path-divider">
                /
              </span>
              <Link href={`/knowledge-base/${crumb.slug}`}>{crumb.title}</Link>
            </span>
          ))}
        </nav>
        <h1 className="knowledge-passport-title">{active.title}</h1>
        {active.subtitle ? <p className="knowledge-passport-subtitle">{active.subtitle}</p> : null}
        <div className="knowledge-passport-meta">
          {indexCode ? <span className="knowledge-passport-code">№ {indexCode}</span> : null}
          {readingMinutes > 0 ? (
            <span className="knowledge-passport-meta-item">
              <Clock3 aria-hidden="true" size={14} strokeWidth={2.2} />≈ {readingMinutes}{" "}
              {pluralizeRu(readingMinutes, "минута", "минуты", "минут")} чтения
            </span>
          ) : null}
          {childCount > 0 ? (
            <span className="knowledge-passport-meta-item">
              <Layers2 aria-hidden="true" size={14} strokeWidth={2.2} />
              {childCount} {pluralizeRu(childCount, "подвид", "подвида", "подвидов")}
            </span>
          ) : null}
        </div>
      </div>
      <figure className="knowledge-passport-cover">
        {coverUrl ? (
          <CoverImage
            alt={active.title}
            src={coverUrl}
            eager
            onLoadSettled={(ok) => {
              setCoverState(ok ? "ok" : "error");
              if (active.coverImageId) onCoverSettled?.(active.coverImageId);
            }}
            sizes="(max-width: 880px) 100vw, 420px"
          />
        ) : null}
        {!coverUrl || coverState !== "ok" ? <MaterialCoverFallback depth={depth} node={active} /> : null}
      </figure>
    </motion.header>
  );
}
