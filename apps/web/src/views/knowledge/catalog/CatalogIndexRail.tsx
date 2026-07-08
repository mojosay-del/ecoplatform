"use client";

// Липкая лента-индекс каталога: чипы «01 Макулатура · 02 Плёнки …» со scroll-spy.
// Клик плавно скроллит к секции категории (якорная навигация вместо дерева).

import { useReducedMotion } from "motion/react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { useScrollSpy } from "../../../lib/use-scroll-spy";

export function CatalogIndexRail({ categories, codes }: { categories: KnowledgeNode[]; codes: Map<string, string> }) {
  const reducedMotion = useReducedMotion();
  const activeSlug = useScrollSpy(
    categories.map((node) => node.slug),
    "data-catalog-slug",
  );

  if (categories.length < 2) return null;

  function scrollToSection(slug: string) {
    document
      .querySelector(`[data-catalog-slug="${slug}"]`)
      ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <nav aria-label="Разделы каталога" className="knowledge-index-rail">
      {categories.map((node) => (
        <button
          className={`knowledge-index-chip${node.slug === activeSlug ? " is-active" : ""}`}
          key={node.id}
          type="button"
          onClick={() => scrollToSection(node.slug)}
        >
          <span aria-hidden="true" className="knowledge-index-chip-code">
            {codes.get(node.slug)}
          </span>
          {node.title}
        </button>
      ))}
    </nav>
  );
}
