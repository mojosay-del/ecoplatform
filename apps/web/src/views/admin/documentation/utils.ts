import { DOC_CATEGORY_ICON_TYPE } from "./constants";
import type { DocArticle } from "./types";

export function isDocCategory(article: DocArticle) {
  return article.iconType === DOC_CATEGORY_ICON_TYPE;
}

export function sortByPosition(a: DocArticle, b: DocArticle) {
  return a.position - b.position;
}

// ISO-дата из API ("2026-05-01T00:00:00.000Z") → значение для <input type="date">.
export function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// Значение <input type="date"> → ISO-datetime для API (или null).
export function dateInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
