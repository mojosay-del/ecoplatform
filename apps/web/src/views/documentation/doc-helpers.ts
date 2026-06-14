import type { DocumentationNode } from "@ecoplatform/shared";

// Человекочитаемый размер файла (Б / КБ / МБ). Для КБ/МБ <10 — один знак после
// запятой, иначе целое.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} Б`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} КБ`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} МБ`;
}

const RU_DATE = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });

export function formatRuDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return RU_DATE.format(date);
}

export type Freshness = "new" | "updated";

const FRESH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// «Свежесть» документа для бейджа карточки/ленты:
//   "updated" — обновлён после первой публикации (revisedAt > firstPublishedAt);
//   "new"     — недавно опубликован и ни разу не обновлялся;
//   null      — давно опубликован, без свежих изменений.
export function freshness(
  node: Pick<DocumentationNode, "firstPublishedAt" | "revisedAt">,
  now: number = Date.now(),
): Freshness | null {
  const first = node.firstPublishedAt ? new Date(node.firstPublishedAt).getTime() : null;
  const revised = node.revisedAt ? new Date(node.revisedAt).getTime() : null;
  if (first !== null && revised !== null && revised > first && now - revised < FRESH_WINDOW_MS) {
    return "updated";
  }
  if (first !== null && (revised === null || revised <= first) && now - first < FRESH_WINDOW_MS) {
    return "new";
  }
  return null;
}

// Плоский список документов-листьев из дерева (для опций фильтра форматов).
export function flattenDocuments(nodes: DocumentationNode[]): DocumentationNode[] {
  const out: DocumentationNode[] = [];
  const walk = (list: DocumentationNode[]) => {
    for (const node of list) {
      if (node.iconType !== "category") {
        out.push(node);
      }
      if (node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}
