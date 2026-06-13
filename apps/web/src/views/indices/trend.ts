// Единый источник правды для семантики тренда на странице индексов: рост =
// зелёный, снижение = красный, без изменений = нейтраль. Раньше графики говорили
// синим/оранжевым, а таблица — зелёным/красным; всё сведено сюда, чтобы цвет
// значил одно и то же в карточках, спарклайнах, графиках и чипах.

export type TrendDirection = "up" | "down" | "flat";

// Для SVG (stroke/fill). CSS-переменные работают как presentation-значения у
// элементов в DOM — так же, как уже используется var(--line)/var(--muted) в
// сводном графике.
export const TREND_COLOR: Record<TrendDirection, string> = {
  up: "var(--green)",
  down: "var(--red)",
  flat: "var(--muted)",
};

export const TREND_LABEL: Record<TrendDirection, string> = {
  up: "Рост",
  down: "Снижение",
  flat: "Без изменений",
};

// Тренд с бэка ("growth" | "stagnation" | "fall" | null) → наша тройка.
export function trendFromSummary(trend: "growth" | "stagnation" | "fall" | null | undefined): TrendDirection {
  if (trend === "growth") return "up";
  if (trend === "fall") return "down";
  return "flat";
}

// Направление по числовому изменению (для дельт «±X%»).
export function directionFromChange(change: number | null | undefined): TrendDirection {
  if (change === null || change === undefined || !Number.isFinite(change) || change === 0) return "flat";
  return change > 0 ? "up" : "down";
}

// Net-направление набора точек: сравниваем первую и последнюю валидную цену.
// Используется, чтобы покрасить линию/спарклайн под фактическое движение за
// показанный период (а не под недельный тренд с бэка).
export function netDirection(points: Array<{ price: number }>): TrendDirection {
  const prices = points.map((point) => Number(point.price)).filter((price) => Number.isFinite(price));
  if (prices.length < 2) return "flat";
  const first = prices[0]!;
  const last = prices[prices.length - 1]!;
  if (last > first) return "up";
  if (last < first) return "down";
  return "flat";
}
