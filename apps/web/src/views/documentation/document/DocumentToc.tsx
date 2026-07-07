"use client";

// Оглавление документа: собирается из heading/subheading-блоков описания.
// На широких экранах — липкая колонка справа со scroll-spy, на узких —
// раскрывашка над текстом (details/summary).

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { DocumentationTocEntry } from "../documentation-utils";

export const DOCUMENTATION_HEADING_ANCHOR_PREFIX = "doc-part";

export function DocumentToc({ entries }: { entries: DocumentationTocEntry[] }) {
  const reducedMotion = useReducedMotion();
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const anchorsKey = entries.map((entry) => entry.blockIndex).join(",");

  useEffect(() => {
    const anchorIds = anchorsKey
      ? anchorsKey.split(",").map((blockIndex) => `${DOCUMENTATION_HEADING_ANCHOR_PREFIX}-${blockIndex}`)
      : [];
    if (anchorIds.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          if (entry.isIntersecting) {
            visible.set(entry.target.id, entry.boundingClientRect.top);
          } else {
            visible.delete(entry.target.id);
          }
        }
        if (visible.size === 0) return;
        const topmost = Array.from(visible.entries()).sort((a, b) => a[1] - b[1])[0];
        if (topmost) setActiveAnchor(topmost[0]);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );

    for (const anchorId of anchorIds) {
      const element = document.getElementById(anchorId);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [anchorsKey]);

  if (entries.length < 3) return null;

  function scrollToAnchor(blockIndex: number) {
    document
      .getElementById(`${DOCUMENTATION_HEADING_ANCHOR_PREFIX}-${blockIndex}`)
      ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  const list = (
    <ol className="doc-toc-list">
      {entries.map((entry) => {
        const anchorId = `${DOCUMENTATION_HEADING_ANCHOR_PREFIX}-${entry.blockIndex}`;
        return (
          <li key={entry.blockIndex}>
            <button
              className={`doc-toc-link${entry.level === 3 ? " is-sub" : ""}${
                anchorId === activeAnchor ? " is-active" : ""
              }`}
              type="button"
              onClick={() => scrollToAnchor(entry.blockIndex)}
            >
              {entry.text}
            </button>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <nav aria-label="Содержание документа" className="doc-toc">
        <p className="doc-toc-kicker">Содержание</p>
        {list}
      </nav>
      <details className="doc-toc-disclosure">
        <summary>Содержание документа</summary>
        {list}
      </details>
    </>
  );
}
