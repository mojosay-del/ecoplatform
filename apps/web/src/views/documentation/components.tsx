"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { Clock, Download, FileText, Pin } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { documentationDisplayIconForNode } from "../documentation-icons";
import { formatColor, formatLabel } from "./documentFormats";
import { formatBytes, formatRuDate, freshness, type Freshness } from "./doc-helpers";
import { documentationSearchSnippetSegments, documentationSearchSnippetSourceLabel } from "./search-snippet";

function fmtStyle(format: string | undefined): CSSProperties {
  return { ["--fmt" as string]: formatColor(format) } as CSSProperties;
}

export function FormatBadge({ format }: { format?: string }) {
  return (
    <span className="doc-fmt" style={fmtStyle(format)}>
      {formatLabel(format)}
    </span>
  );
}

function FreshnessBadge({ kind }: { kind: Freshness }) {
  return <span className={`doc-fresh doc-fresh-${kind}`}>{kind === "new" ? "Новое" : "Обновлено"}</span>;
}

function metaLine(node: DocumentationNode): string {
  const parts: string[] = [];
  if (node.file) parts.push(formatBytes(node.file.sizeBytes));
  const date = formatRuDate(node.revisedAt ?? node.firstPublishedAt);
  if (date) parts.push(date);
  return parts.join(" · ");
}

export function DocumentCard({
  node,
  onDownload,
}: {
  node: DocumentationNode;
  onDownload: (node: DocumentationNode) => void;
}) {
  const fresh = freshness(node);
  return (
    <article className="doc-card">
      <Link className="doc-card-main" href={`/documentation/${node.slug}`}>
        <div className="doc-card-top">
          <FormatBadge format={node.file?.format} />
          {fresh ? <FreshnessBadge kind={fresh} /> : null}
        </div>
        <h3 className="doc-card-title">{node.title}</h3>
        {node.searchSnippet ? (
          <DocumentationSearchSnippet snippet={node.searchSnippet} />
        ) : node.subtitle ? (
          <p className="doc-card-sub">{node.subtitle}</p>
        ) : null}
      </Link>
      <div className="doc-card-foot">
        <span className="doc-card-meta">{metaLine(node)}</span>
        {node.file ? (
          <button type="button" className="doc-dl" onClick={() => onDownload(node)}>
            <Download size={14} aria-hidden="true" />
            Скачать
          </button>
        ) : (
          <Link className="doc-dl is-ghost" href={`/documentation/${node.slug}`}>
            Открыть
          </Link>
        )}
      </div>
    </article>
  );
}

function DocumentationSearchSnippet({ snippet }: { snippet: NonNullable<DocumentationNode["searchSnippet"]> }) {
  return (
    <p className="doc-search-snippet">
      <span>{documentationSearchSnippetSourceLabel(snippet.source)}: </span>
      {documentationSearchSnippetSegments(snippet).map((segment, index) =>
        segment.highlighted ? (
          <mark key={`${segment.text}-${index}`}>{segment.text}</mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

export function EssentialsStrip({
  items,
  onDownload,
}: {
  items: DocumentationNode[];
  onDownload: (node: DocumentationNode) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="doc-essentials" aria-label="Часто нужные">
      <div className="doc-section-head">
        <Pin size={15} aria-hidden="true" />
        <span>Часто нужные</span>
      </div>
      <div className="doc-essentials-row">
        {items.map((node) => (
          <div className="doc-essential" key={node.id}>
            <FormatBadge format={node.file?.format} />
            <Link className="doc-essential-title" href={`/documentation/${node.slug}`}>
              {node.title}
            </Link>
            {node.file ? (
              <button
                type="button"
                className="doc-essential-dl"
                onClick={() => onDownload(node)}
                aria-label={`Скачать «${node.title}»`}
              >
                <Download size={15} aria-hidden="true" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RecentlyUpdated({ items }: { items: DocumentationNode[] }) {
  if (items.length === 0) return null;
  return (
    <section className="doc-recent" aria-label="Недавно обновлено">
      <div className="doc-section-head">
        <Clock size={15} aria-hidden="true" />
        <span>Недавно обновлено</span>
      </div>
      <ul className="doc-recent-list">
        {items.map((node) => {
          const fresh = freshness(node);
          const date = formatRuDate(node.revisedAt ?? node.firstPublishedAt);
          return (
            <li key={node.id} className="doc-recent-item">
              <FormatBadge format={node.file?.format} />
              <Link className="doc-recent-title" href={`/documentation/${node.slug}`}>
                {node.title}
              </Link>
              <span className="doc-recent-meta">
                {fresh ? <FreshnessBadge kind={fresh} /> : null}
                {date ? <span className="doc-recent-date">{date}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function FormatFilter({
  formats,
  active,
  onChange,
}: {
  formats: string[];
  active: string | null;
  onChange: (format: string | null) => void;
}) {
  if (formats.length <= 1) return null;
  return (
    <div className="doc-filter" role="group" aria-label="Фильтр по формату">
      <span className="doc-filter-label">Формат:</span>
      <button type="button" className={`doc-chip${active === null ? " on" : ""}`} onClick={() => onChange(null)}>
        Все
      </button>
      {formats.map((format) => (
        <button
          key={format}
          type="button"
          className={`doc-chip${active === format ? " on" : ""}`}
          style={fmtStyle(format)}
          onClick={() => onChange(format)}
        >
          {formatLabel(format)}
        </button>
      ))}
    </div>
  );
}

function DocTreeNode({
  node,
  activeId,
  onSelect,
}: {
  node: DocumentationNode;
  activeId: string | null;
  onSelect: (node: DocumentationNode) => void;
}) {
  if (node.iconType !== "category") {
    return (
      <Link className="doc-tree-leaf" href={`/documentation/${node.slug}`}>
        <FileText size={14} aria-hidden="true" />
        <span>{node.title}</span>
      </Link>
    );
  }
  const children = node.children ?? [];
  const childCategories = children.filter((child) => child.iconType === "category");
  const docCount = children.filter((child) => child.iconType !== "category").length;
  const CategoryIcon = documentationDisplayIconForNode(node);
  return (
    <div className="doc-tree-group">
      <button
        type="button"
        className={`doc-tree-cat${activeId === node.id ? " on" : ""}`}
        onClick={() => onSelect(node)}
      >
        <span className="doc-tree-cat-main">
          <span className="doc-tree-cat-icon" aria-hidden="true">
            <CategoryIcon size={15} strokeWidth={2.1} />
          </span>
          <span className="doc-tree-cat-label">{node.title}</span>
        </span>
        <span className="doc-tree-count">{docCount}</span>
      </button>
      {childCategories.length > 0 ? (
        <div className="doc-tree-children">
          {childCategories.map((child) => (
            <DocTreeNode key={child.id} node={child} activeId={activeId} onSelect={onSelect} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DocTree({
  nodes,
  activeId,
  onSelect,
}: {
  nodes: DocumentationNode[];
  activeId: string | null;
  onSelect: (node: DocumentationNode) => void;
}) {
  return (
    <nav className="doc-tree" aria-label="Разделы документации">
      {nodes.map((node) => (
        <DocTreeNode key={node.id} node={node} activeId={activeId} onSelect={onSelect} />
      ))}
    </nav>
  );
}
