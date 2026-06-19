"use client";

import Link from "next/link";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { knowledgeDisplayIconForNode } from "./knowledge-base-icons";
import { knowledgeNodeContainsSlug } from "./knowledge-base-utils";

export function KnowledgeNavigation({
  tree,
  activeSlug,
  onNavigate,
  showHeading,
}: {
  tree: KnowledgeNode[];
  activeSlug?: string;
  onNavigate?: () => void;
  showHeading: boolean;
}) {
  return (
    <>
      {showHeading ? (
        <div className="knowledge-nav-heading">
          <h2>Навигация по сырью</h2>
        </div>
      ) : null}
      {tree.length === 0 ? (
        <p className="page-subtitle">Статей пока нет.</p>
      ) : (
        <nav className="knowledge-nav-list" aria-label="Разделы сырья">
          {tree.map((node) => (
            <KnowledgeNavNode key={node.id} node={node} activeSlug={activeSlug} depth={0} onNavigate={onNavigate} />
          ))}
        </nav>
      )}
    </>
  );
}

function KnowledgeNavNode({
  node,
  activeSlug,
  depth,
  onNavigate,
}: {
  node: KnowledgeNode;
  activeSlug?: string;
  depth: number;
  onNavigate?: () => void;
}) {
  const children = node.children ?? [];
  const isActive = node.slug === activeSlug;
  const hasActiveChild = children.some((child) => knowledgeNodeContainsSlug(child, activeSlug));
  const Icon = knowledgeDisplayIconForNode(node, depth);

  return (
    <div className={`knowledge-nav-group ${hasActiveChild ? "has-active-child" : ""}`}>
      <Link
        className={`knowledge-nav-link ${isActive ? "active" : ""}`}
        href={`/knowledge-base/${node.slug}`}
        onClick={onNavigate}
      >
        <span className="knowledge-nav-icon" aria-hidden="true">
          <Icon size={depth === 0 ? 17 : 15} strokeWidth={2.15} />
        </span>
        <span className="knowledge-nav-label">{node.title}</span>
      </Link>
      {children.length > 0 ? (
        <div className="knowledge-nav-children">
          {children.map((child) => (
            <KnowledgeNavNode
              activeSlug={activeSlug}
              depth={depth + 1}
              key={child.id}
              node={child}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
