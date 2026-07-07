"use client";

// «Указатель реестра» на странице документа: текущий раздел раскрыт, остальные
// свёрнуты, сверху ссылка «Весь реестр». Используется и на десктопе (aside), и
// внутри мобильного drawer.

import Link from "next/link";
import { ArrowLeft, FolderOpen, type LucideIcon } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { documentationDisplayIconForNode } from "../../documentation-icons";
import { documentationNodeContainsSlug } from "../documentation-utils";

export function DocumentSidebar({
  activeSlug,
  codes,
  tree,
  onNavigate,
  showCatalogLink = true,
}: {
  activeSlug?: string;
  codes: Map<string, string>;
  tree: DocumentationNode[];
  onNavigate?: () => void;
  showCatalogLink?: boolean;
}) {
  return (
    <aside aria-label="Навигация по реестру" className="doc-sidebar">
      {showCatalogLink ? (
        <Link className="doc-sidebar-catalog-link" href="/documentation" onClick={onNavigate}>
          <ArrowLeft aria-hidden="true" size={15} strokeWidth={2.4} />
          Весь реестр
        </Link>
      ) : null}
      <div className="doc-sidebar-groups">
        {tree.map((node) =>
          node.iconType === "category" ? (
            <SidebarCategory
              activeSlug={activeSlug}
              category={node}
              codes={codes}
              key={node.id}
              onNavigate={onNavigate}
            />
          ) : (
            <div className="doc-sidebar-loose" key={node.id}>
              <SidebarLink activeSlug={activeSlug} depth={0} node={node} onNavigate={onNavigate} />
            </div>
          ),
        )}
      </div>
    </aside>
  );
}

function SidebarCategory({
  activeSlug,
  category,
  codes,
  onNavigate,
}: {
  activeSlug?: string;
  category: DocumentationNode;
  codes: Map<string, string>;
  onNavigate?: () => void;
}) {
  const containsActive = documentationNodeContainsSlug(category, activeSlug);

  return (
    <details className="doc-sidebar-group" open={containsActive}>
      <summary className="doc-sidebar-summary">
        <span aria-hidden="true" className="doc-sidebar-code">
          {codes.get(category.slug)}
        </span>
        <span className="doc-sidebar-summary-title">{category.title}</span>
      </summary>
      <div className="doc-sidebar-links">
        {(category.children ?? []).map((node) =>
          node.iconType === "category" ? (
            <SidebarSubtree activeSlug={activeSlug} depth={1} key={node.id} node={node} onNavigate={onNavigate} />
          ) : (
            <SidebarLink activeSlug={activeSlug} depth={1} key={node.id} node={node} onNavigate={onNavigate} />
          ),
        )}
      </div>
    </details>
  );
}

function SidebarSubtree({
  activeSlug,
  depth,
  node,
  onNavigate,
}: {
  activeSlug?: string;
  depth: number;
  node: DocumentationNode;
  onNavigate?: () => void;
}) {
  return (
    <>
      <SidebarLink
        activeSlug={activeSlug}
        depth={depth}
        icon={FolderOpen}
        label={node.title}
        node={node}
        onNavigate={onNavigate}
      />
      {(node.children ?? []).map((child) => (
        <SidebarLink activeSlug={activeSlug} depth={depth + 1} key={child.id} node={child} onNavigate={onNavigate} />
      ))}
    </>
  );
}

function SidebarLink({
  activeSlug,
  depth,
  icon,
  label,
  node,
  onNavigate,
}: {
  activeSlug?: string;
  depth: number;
  icon?: LucideIcon;
  label?: string;
  node: DocumentationNode;
  onNavigate?: () => void;
}) {
  const Icon = icon ?? documentationDisplayIconForNode(node);
  const isActive = node.slug === activeSlug;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`doc-sidebar-link${isActive ? " is-active" : ""}${depth > 1 ? " is-nested" : ""}`}
      href={`/documentation/${node.slug}`}
      onClick={onNavigate}
    >
      <span aria-hidden="true" className="doc-sidebar-link-icon">
        <Icon size={15} strokeWidth={2.15} />
      </span>
      <span className="doc-sidebar-link-label">{label ?? node.title}</span>
    </Link>
  );
}
