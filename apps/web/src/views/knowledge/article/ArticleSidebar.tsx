"use client";

// «Индекс архива» на странице материала: текущий раздел с соседями раскрыт,
// остальные категории свёрнуты, сверху ссылка «Весь каталог».

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { knowledgeDisplayIconForNode } from "../knowledge-icons";
import { knowledgeNodeContainsSlug } from "../knowledge-utils";

export function ArticleSidebar({
  activeSlug,
  codes,
  tree,
}: {
  activeSlug?: string;
  codes: Map<string, string>;
  tree: KnowledgeNode[];
}) {
  return (
    <aside aria-label="Навигация по базе знаний" className="knowledge-article-sidebar">
      <Link className="knowledge-sidebar-catalog-link" href="/knowledge-base">
        <ArrowLeft aria-hidden="true" size={15} strokeWidth={2.4} />
        Весь каталог
      </Link>
      <div className="knowledge-sidebar-groups">
        {tree.map((category) => (
          <SidebarCategory activeSlug={activeSlug} category={category} codes={codes} key={category.id} />
        ))}
      </div>
    </aside>
  );
}

function SidebarCategory({
  activeSlug,
  category,
  codes,
}: {
  activeSlug?: string;
  category: KnowledgeNode;
  codes: Map<string, string>;
}) {
  const containsActive = knowledgeNodeContainsSlug(category, activeSlug);

  return (
    <details className="knowledge-sidebar-group" open={containsActive}>
      <summary className="knowledge-sidebar-summary">
        <span aria-hidden="true" className="knowledge-sidebar-code">
          {codes.get(category.slug)}
        </span>
        <span className="knowledge-sidebar-summary-title">{category.title}</span>
      </summary>
      <div className="knowledge-sidebar-links">
        <SidebarLink activeSlug={activeSlug} depth={0} node={category} label="Обзор раздела" />
        {(category.children ?? []).map((node) => (
          <SidebarNode activeSlug={activeSlug} depth={1} key={node.id} node={node} />
        ))}
      </div>
    </details>
  );
}

function SidebarNode({ activeSlug, depth, node }: { activeSlug?: string; depth: number; node: KnowledgeNode }) {
  return (
    <>
      <SidebarLink activeSlug={activeSlug} depth={depth} node={node} />
      {(node.children ?? []).map((child) => (
        <SidebarNode activeSlug={activeSlug} depth={depth + 1} key={child.id} node={child} />
      ))}
    </>
  );
}

function SidebarLink({
  activeSlug,
  depth,
  label,
  node,
}: {
  activeSlug?: string;
  depth: number;
  label?: string;
  node: KnowledgeNode;
}) {
  const Icon = knowledgeDisplayIconForNode(node, depth);
  const isActive = node.slug === activeSlug;

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={`knowledge-sidebar-link${isActive ? " is-active" : ""}${depth > 1 ? " is-nested" : ""}`}
      href={`/knowledge-base/${node.slug}`}
    >
      <span aria-hidden="true" className="knowledge-sidebar-link-icon">
        <Icon size={15} strokeWidth={2.15} />
      </span>
      <span className="knowledge-sidebar-link-label">{label ?? node.title}</span>
    </Link>
  );
}
