"use client";

// «Недавно обновлено» — журнал-ведомость реестра: строка с датой, пластиной
// формата, названием и штампом свежести.

import Link from "next/link";
import { Clock } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { FormatPlate, FreshnessBadge } from "../doc-badges";
import { formatRuDate, freshness } from "../doc-helpers";

export function RecentLedger({ items }: { items: DocumentationNode[] }) {
  if (items.length === 0) return null;

  return (
    <section className="doc-ledger" aria-label="Недавно обновлено">
      <header className="doc-ledger-head">
        <span aria-hidden="true" className="doc-ledger-icon">
          <Clock size={15} strokeWidth={2.2} />
        </span>
        <span className="doc-ledger-title">Недавно обновлено</span>
      </header>
      <ul className="doc-ledger-list">
        {items.map((node) => {
          const fresh = freshness(node);
          const date = formatRuDate(node.revisedAt ?? node.firstPublishedAt);
          return (
            <li key={node.id} className="doc-ledger-item">
              <span className="doc-ledger-date">{date ?? "—"}</span>
              <FormatPlate format={node.file?.format} />
              <Link className="doc-ledger-name" href={`/documentation/${node.slug}`}>
                {node.title}
              </Link>
              {fresh ? <FreshnessBadge kind={fresh} /> : <span aria-hidden="true" />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
