"use client";

// Липкая лента-указатель реестра: чипы «01 Договоры · 02 Регламенты …» со
// scroll-spy. Клик плавно скроллит к секции раздела (якорная навигация).

import { useReducedMotion } from "motion/react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { useScrollSpy } from "../../../lib/use-scroll-spy";

export function RegistryIndexRail({ sections, codes }: { sections: DocumentationNode[]; codes: Map<string, string> }) {
  const reducedMotion = useReducedMotion();
  const activeSlug = useScrollSpy(
    sections.map((node) => node.slug),
    "data-registry-slug",
  );

  if (sections.length < 2) return null;

  function scrollToSection(slug: string) {
    document
      .querySelector(`[data-registry-slug="${slug}"]`)
      ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  return (
    <nav aria-label="Разделы реестра" className="doc-index-rail">
      {sections.map((node) => (
        <button
          className={`doc-index-chip${node.slug === activeSlug ? " is-active" : ""}`}
          key={node.id}
          type="button"
          onClick={() => scrollToSection(node.slug)}
        >
          <span aria-hidden="true" className="doc-index-chip-code">
            {codes.get(node.slug)}
          </span>
          {node.title}
        </button>
      ))}
    </nav>
  );
}
