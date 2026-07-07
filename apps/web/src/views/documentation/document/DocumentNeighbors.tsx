"use client";

// Навигация по соседним документам раздела: «← Предыдущий / Следующий →».
// Соседи считаются из уже загруженного дерева — без запросов к API.

import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { DocumentationNeighbors } from "../documentation-utils";

export function DocumentNeighbors({ neighbors }: { neighbors: DocumentationNeighbors }) {
  if (!neighbors.prev && !neighbors.next) return null;

  return (
    <nav aria-label="Соседние документы" className="doc-neighbors">
      {neighbors.prev ? (
        <Link className="doc-neighbor is-prev" href={`/documentation/${neighbors.prev.slug}`}>
          <span className="doc-neighbor-kicker">
            <ArrowLeft aria-hidden="true" size={13} strokeWidth={2.4} />
            Предыдущий
          </span>
          <span className="doc-neighbor-title">{neighbors.prev.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {neighbors.next ? (
        <Link className="doc-neighbor is-next" href={`/documentation/${neighbors.next.slug}`}>
          <span className="doc-neighbor-kicker">
            Следующий
            <ArrowRight aria-hidden="true" size={13} strokeWidth={2.4} />
          </span>
          <span className="doc-neighbor-title">{neighbors.next.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
