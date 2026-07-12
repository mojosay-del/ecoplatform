"use client";

// «Часто нужные» — полка закреплённых документов у шапки реестра: быстрые
// квитки с пластиной формата и кнопкой скачивания.

import Link from "next/link";
import { Download, Pin } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { FormatPlate, fmtStyle } from "../doc-badges";

export function EssentialsShelf({
  items,
  onDownload,
}: {
  items: DocumentationNode[];
  onDownload: (node: DocumentationNode) => void;
}) {
  if (items.length === 0) return null;

  return (
    <section className="doc-shelf" data-tour="doc-essentials" aria-label="Часто нужные">
      <header className="doc-shelf-head">
        <span aria-hidden="true" className="doc-shelf-icon">
          <Pin size={15} strokeWidth={2.2} />
        </span>
        <span className="doc-shelf-title">Часто нужные</span>
      </header>
      <div className="doc-shelf-row">
        {items.map((node) => (
          <div className="doc-quick" key={node.id} style={fmtStyle(node.file?.format)}>
            <span aria-hidden="true" className="doc-quick-spine" />
            <Link className="doc-quick-body" href={`/documentation/${node.slug}`}>
              <FormatPlate format={node.file?.format} />
              <span className="doc-quick-title">{node.title}</span>
            </Link>
            {node.file ? (
              <button
                type="button"
                className="doc-quick-dl"
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
