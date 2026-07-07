"use client";

// Карточка-документ реестра: цветной корешок формата, иконка типа, реестровый
// код, пластина формата, штампы (версия / «действует с» / свежесть / печать
// «Закреплено») и подвал с метаданными и быстрым скачиванием.

import Link from "next/link";
import { ArrowUpRight, Download } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { documentationDisplayIconForNode } from "../../documentation-icons";
import { FormatPlate, FreshnessBadge, PinnedSeal, fmtStyle, highlightMatch } from "../doc-badges";
import { formatBytes, formatRuDate, freshness } from "../doc-helpers";
import { documentationSearchSnippetSegments, documentationSearchSnippetSourceLabel } from "../search-snippet";

function metaLine(node: DocumentationNode): string {
  const parts: string[] = [];
  if (node.file) parts.push(formatBytes(node.file.sizeBytes));
  const date = formatRuDate(node.revisedAt ?? node.firstPublishedAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export function DocumentCard({
  node,
  indexCode,
  highlightQuery,
  onDownload,
  onNavigate,
}: {
  node: DocumentationNode;
  indexCode?: string;
  highlightQuery?: string;
  onDownload: (node: DocumentationNode) => void;
  onNavigate?: () => void;
}) {
  const Icon = documentationDisplayIconForNode(node);
  const fresh = freshness(node);
  const effective = formatRuDate(node.effectiveDate);
  const meta = metaLine(node);

  return (
    <article className="doc-card" style={fmtStyle(node.file?.format)}>
      <span aria-hidden="true" className="doc-card-spine" />
      <Link className="doc-card-body" href={`/documentation/${node.slug}`} onClick={onNavigate}>
        <div className="doc-card-head">
          <span aria-hidden="true" className="doc-card-icon">
            <Icon size={17} strokeWidth={2.1} />
          </span>
          {indexCode ? (
            <span aria-hidden="true" className="doc-card-code">
              {indexCode}
            </span>
          ) : null}
          <span className="doc-card-head-spacer" />
          <FormatPlate format={node.file?.format} />
        </div>
        <h3 className="doc-card-title">{highlightMatch(node.title, highlightQuery)}</h3>
        {node.searchSnippet ? (
          <p className="doc-card-snippet">
            <span className="doc-card-snippet-source">
              {documentationSearchSnippetSourceLabel(node.searchSnippet.source)}:{" "}
            </span>
            {documentationSearchSnippetSegments(node.searchSnippet).map((segment, index) =>
              segment.highlighted ? (
                <mark className="doc-mark" key={`${segment.text}-${index}`}>
                  {segment.text}
                </mark>
              ) : (
                <span key={`${segment.text}-${index}`}>{segment.text}</span>
              ),
            )}
          </p>
        ) : node.subtitle ? (
          <p className="doc-card-sub">{node.subtitle}</p>
        ) : null}
        {node.version || effective || node.isPinned || fresh ? (
          <div className="doc-card-stamps">
            {node.isPinned ? <PinnedSeal /> : null}
            {node.version ? <span className="doc-stamp">Версия {node.version}</span> : null}
            {effective ? <span className="doc-stamp doc-stamp-date">Действует с {effective}</span> : null}
            {fresh ? <FreshnessBadge kind={fresh} /> : null}
          </div>
        ) : null}
        <span aria-hidden="true" className="doc-card-open">
          Открыть
          <ArrowUpRight size={14} strokeWidth={2.4} />
        </span>
      </Link>
      <div className="doc-card-foot">
        <span className="doc-card-meta">{meta || "Документ"}</span>
        {node.file ? (
          <button
            type="button"
            className="doc-dl"
            onClick={() => onDownload(node)}
            aria-label={`Скачать «${node.title}»`}
          >
            <Download size={14} aria-hidden="true" />
            Скачать
          </button>
        ) : (
          <Link className="doc-dl is-ghost" href={`/documentation/${node.slug}`} onClick={onNavigate}>
            Открыть
          </Link>
        )}
      </div>
    </article>
  );
}

export function DocumentCardSkeleton() {
  return (
    <div aria-hidden="true" className="doc-card is-skeleton">
      <span className="doc-card-spine" />
      <div className="doc-card-body">
        <div className="doc-card-head">
          <span className="page-skeleton-bar w-1-4" />
        </div>
        <div className="page-skeleton-bar w-3-4" />
        <div className="page-skeleton-bar w-full" />
        <div className="page-skeleton-bar w-1-2" />
      </div>
    </div>
  );
}
