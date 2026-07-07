"use client";

// Презентационные «канцелярские» бейджи реестра: пластина формата, штамп
// свежести, сургучная печать «Закреплено» и подсветка совпадения поиска.
// Формат = цвет через --fmt (из documentFormats.formatColor).

import type { CSSProperties, ReactNode } from "react";
import { formatColor, formatLabel } from "./documentFormats";
import type { Freshness } from "./doc-helpers";

export function fmtStyle(format: string | undefined): CSSProperties {
  return { ["--fmt" as string]: formatColor(format) } as CSSProperties;
}

export function FormatPlate({ format }: { format?: string }) {
  return (
    <span className="doc-plate" style={fmtStyle(format)}>
      <span aria-hidden="true" className="doc-plate-dot" />
      {formatLabel(format)}
    </span>
  );
}

export function FreshnessBadge({ kind }: { kind: Freshness }) {
  return <span className={`doc-fresh doc-fresh-${kind}`}>{kind === "new" ? "Новое" : "Обновлено"}</span>;
}

export function PinnedSeal() {
  return (
    <span className="doc-seal" title="Закреплённый документ">
      <span aria-hidden="true" className="doc-seal-ring" />
      Закреплено
    </span>
  );
}

// Подсветка совпадения в заголовке (клиентский поиск по названию карточки).
export function highlightMatch(text: string, query?: string): ReactNode {
  const needle = query?.trim();
  if (!needle) return text;
  const lowerText = text.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const found = lowerText.indexOf(lowerNeedle, cursor);
    if (found === -1) {
      parts.push(text.slice(cursor));
      break;
    }
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark className="doc-mark" key={`${found}`}>
        {text.slice(found, found + needle.length)}
      </mark>,
    );
    cursor = found + needle.length;
  }
  return parts;
}
