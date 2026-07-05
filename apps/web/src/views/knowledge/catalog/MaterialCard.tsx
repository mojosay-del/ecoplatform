"use client";

// Карточка-«образец» архивного каталога: фактурная обложка, архивный код-ярлык,
// бумажная этикетка с названием. Используется в секциях витрины, результатах
// поиска и сетке «В этом разделе» на странице категории.

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { CoverImage } from "../../../components/CoverImage";
import { pluralizeRu } from "../../shared";
import { MaterialCoverFallback } from "./MaterialCoverFallback";

export function highlightMatch(text: string, query?: string): ReactNode {
  const needle = query?.trim();
  if (!needle) return text;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerNeedle, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark className="knowledge-mark" key={`${found}`}>
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    cursor = found + needle.length;
  }
  return parts;
}

export function MaterialCard({
  coverUrl,
  depth = 1,
  highlightQuery,
  indexCode,
  kicker,
  node,
  onNavigate,
}: {
  coverUrl: string | null;
  depth?: number;
  highlightQuery?: string;
  indexCode?: string;
  kicker?: string;
  node: KnowledgeNode;
  onNavigate?: () => void;
}) {
  const [coverState, setCoverState] = useState<"loading" | "ok" | "error">("loading");
  const childCount = (node.children ?? []).length;

  return (
    <article className="knowledge-card">
      <Link className="knowledge-card-link" href={`/knowledge-base/${node.slug}`} onClick={onNavigate}>
        <div className="knowledge-card-cover">
          {coverUrl ? (
            <CoverImage
              alt=""
              src={coverUrl}
              onLoadSettled={(ok) => setCoverState(ok ? "ok" : "error")}
              sizes="(max-width: 720px) 100vw, (max-width: 1180px) 50vw, 33vw"
            />
          ) : null}
          {/* Фолбэк держим поверх, пока фото не загрузилось успешно: битые ссылки
              (например, недоступный бакет) не должны показывать сломанный img. */}
          {!coverUrl || coverState !== "ok" ? <MaterialCoverFallback depth={depth} node={node} /> : null}
          {indexCode ? (
            <span aria-hidden="true" className="knowledge-card-code">
              {indexCode}
            </span>
          ) : null}
        </div>
        <div className="knowledge-card-label">
          {kicker ? <span className="knowledge-card-kicker">{kicker}</span> : null}
          <strong className="knowledge-card-title">{highlightMatch(node.title, highlightQuery)}</strong>
          {node.subtitle ? (
            <span className="knowledge-card-subtitle">{highlightMatch(node.subtitle, highlightQuery)}</span>
          ) : null}
          <span className="knowledge-card-meta">
            {childCount > 0 ? `${childCount} ${pluralizeRu(childCount, "подвид", "подвида", "подвидов")}` : "Материал"}
            <ArrowUpRight aria-hidden="true" className="knowledge-card-meta-arrow" size={14} strokeWidth={2.4} />
          </span>
        </div>
      </Link>
    </article>
  );
}

export function MaterialCardSkeleton() {
  return (
    <div aria-hidden="true" className="knowledge-card is-skeleton">
      <div className="knowledge-card-link">
        <div className="knowledge-card-cover">
          <span className="cover-skeleton" />
        </div>
        <div className="knowledge-card-label">
          <div className="page-skeleton-bar w-2-3" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-1-2" />
        </div>
      </div>
    </div>
  );
}
