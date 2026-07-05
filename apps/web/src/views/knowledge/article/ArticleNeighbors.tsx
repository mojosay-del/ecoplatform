"use client";

// Навигация по соседям в разделе: «← Предыдущий материал / Следующий →».
// Соседи считаются из уже загруженного дерева — без запросов к API.

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { KnowledgeNeighbors } from "../knowledge-utils";

export function ArticleNeighbors({ neighbors }: { neighbors: KnowledgeNeighbors }) {
  if (!neighbors.prev && !neighbors.next) return null;

  return (
    <nav aria-label="Соседние материалы" className="knowledge-neighbors">
      {neighbors.prev ? (
        <Link className="knowledge-neighbor is-prev" href={`/knowledge-base/${neighbors.prev.slug}`}>
          <span className="knowledge-neighbor-kicker">
            <ArrowLeft aria-hidden="true" size={13} strokeWidth={2.4} />
            Предыдущий
          </span>
          <span className="knowledge-neighbor-title">{neighbors.prev.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {neighbors.next ? (
        <Link className="knowledge-neighbor is-next" href={`/knowledge-base/${neighbors.next.slug}`}>
          <span className="knowledge-neighbor-kicker">
            Следующий
            <ArrowRight aria-hidden="true" size={13} strokeWidth={2.4} />
          </span>
          <span className="knowledge-neighbor-title">{neighbors.next.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
