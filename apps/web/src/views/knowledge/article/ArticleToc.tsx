"use client";

// Оглавление «листа образца»: собирается из heading/subheading-блоков.
// На широких экранах — липкая колонка справа со scroll-spy, на узких —
// раскрывашка над текстом (details/summary).

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import type { KnowledgeTocEntry } from "../knowledge-utils";

export const KNOWLEDGE_HEADING_ANCHOR_PREFIX = "material-part";

export function ArticleToc({ entries }: { entries: KnowledgeTocEntry[] }) {
  const reducedMotion = useReducedMotion();
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);
  const anchorsKey = entries.map((entry) => entry.blockIndex).join(",");

  useEffect(() => {
    const anchorIds = anchorsKey
      ? anchorsKey.split(",").map((blockIndex) => `${KNOWLEDGE_HEADING_ANCHOR_PREFIX}-${blockIndex}`)
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
      .getElementById(`${KNOWLEDGE_HEADING_ANCHOR_PREFIX}-${blockIndex}`)
      ?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  const list = (
    <ol className="knowledge-toc-list">
      {entries.map((entry) => {
        const anchorId = `${KNOWLEDGE_HEADING_ANCHOR_PREFIX}-${entry.blockIndex}`;
        return (
          <li key={entry.blockIndex}>
            <button
              className={`knowledge-toc-link${entry.level === 3 ? " is-sub" : ""}${
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
      <nav aria-label="Содержание материала" className="knowledge-toc">
        <p className="knowledge-toc-kicker">Содержание</p>
        {list}
      </nav>
      <details className="knowledge-toc-disclosure">
        <summary>Содержание материала</summary>
        {list}
      </details>
    </>
  );
}
