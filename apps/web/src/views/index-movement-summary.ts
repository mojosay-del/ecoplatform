import type { NomenclatureListItem } from "@ecoplatform/shared";
import type { IndexPeriod } from "./indices/types";

const PERIOD_DAYS: Record<IndexPeriod, number> = {
  "2W": 14,
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1Y": 365,
  "2Y": 730,
  "3Y": 1095,
};

export type IndexMovementRow = {
  item: NomenclatureListItem;
  change: number;
  currentPrice: number;
};

export type IndexMovementSummary = {
  rising: IndexMovementRow[];
  falling: IndexMovementRow[];
  flat: IndexMovementRow[];
};

export function getIndexAnchorId(id: string) {
  return `index-${id}`;
}

function getPeriodMovement(item: NomenclatureListItem, period: IndexPeriod): IndexMovementRow | null {
  const uniquePoints = new Map<number, number>();
  const sourcePoints = item.chart?.["3Y"]?.length ? item.chart["3Y"] : Object.values(item.chart ?? {}).flat();

  sourcePoints
    .map((point) => ({ t: new Date(point.date).getTime(), price: Number(point.price) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0)
    .forEach((point) => uniquePoints.set(point.t, point.price));

  const points = Array.from(uniquePoints, ([t, price]) => ({ t, price })).sort((a, b) => a.t - b.t);

  if (points.length < 2) {
    return null;
  }

  const last = points[points.length - 1]!;
  const periodStart = last.t - PERIOD_DAYS[period] * 24 * 60 * 60 * 1000;
  const first = [...points].reverse().find((point) => point.t <= periodStart) ?? points[0]!;

  if (first.t === last.t) {
    return null;
  }

  const change = Number((((last.price - first.price) / first.price) * 100).toFixed(1));

  if (!Number.isFinite(change)) {
    return null;
  }

  return { item, change, currentPrice: last.price };
}

export function getIndexMovementSummary(
  items: NomenclatureListItem[],
  period: IndexPeriod = "2W",
  limit = items.length,
): IndexMovementSummary {
  const movements = items.flatMap((item) => {
    const movement = getPeriodMovement(item, period);

    if (!movement) {
      return [];
    }

    return [movement];
  });

  return {
    rising: movements
      .filter((movement) => movement.change > 0)
      .sort((a, b) => b.change - a.change)
      .slice(0, limit),
    falling: movements
      .filter((movement) => movement.change < 0)
      .sort((a, b) => a.change - b.change)
      .slice(0, limit),
    flat: movements
      .filter((movement) => movement.change === 0)
      .sort((a, b) => a.item.position - b.item.position)
      .slice(0, limit),
  };
}

export type IndexMarketPulse = {
  count: number;
  risingCount: number;
  fallingCount: number;
  flatCount: number;
  averagePrice: number | null;
  averageWeeklyChange: number | null;
  leader: IndexMovementRow | null;
  lastUpdated: Date | null;
};

// Агрегат «пульс рынка» по категории — недельный пульс: сколько индексов
// растёт/падает/стоит (по summary.trend, как и чипы карточек), средняя цена и
// недельная динамика, лидер недели (макс. по модулю weeklyChange) и дата
// последнего обновления. Всё из summary → один период, согласованно.
export function getIndexMarketPulse(items: NomenclatureListItem[]): IndexMarketPulse {
  let risingCount = 0;
  let fallingCount = 0;
  let flatCount = 0;
  for (const item of items) {
    const trend = item.summary?.trend;
    if (trend === "growth") risingCount += 1;
    else if (trend === "fall") fallingCount += 1;
    else if (trend === "stagnation") flatCount += 1;
  }

  const prices = items
    .map((item) => Number(item.summary?.currentPrice))
    .filter((price) => Number.isFinite(price) && price > 0);
  const averagePrice = prices.length ? prices.reduce((sum, price) => sum + price, 0) / prices.length : null;

  const weeklyChanges = items
    .map((item) => item.summary?.weeklyChange)
    .filter((change): change is number => typeof change === "number" && Number.isFinite(change));
  const averageWeeklyChange = weeklyChanges.length
    ? Number((weeklyChanges.reduce((sum, change) => sum + change, 0) / weeklyChanges.length).toFixed(1))
    : null;

  let leader: IndexMovementRow | null = null;
  for (const item of items) {
    const change = item.summary?.weeklyChange;
    if (typeof change !== "number" || !Number.isFinite(change)) continue;
    if (!leader || Math.abs(change) > Math.abs(leader.change)) {
      leader = { item, change, currentPrice: Number(item.summary?.currentPrice ?? 0) };
    }
  }

  const dates = items
    .map((item) => item.summary?.currentDate)
    .filter(Boolean)
    .map((date) => new Date(date as string | Date))
    .filter((date) => !Number.isNaN(date.getTime()));
  const lastUpdated = dates.length ? new Date(Math.max(...dates.map((date) => date.getTime()))) : null;

  return {
    count: items.length,
    risingCount,
    fallingCount,
    flatCount,
    averagePrice,
    averageWeeklyChange,
    leader,
    lastUpdated,
  };
}

export function formatIndexMovementChange(change: number) {
  const formatted = change.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });

  return `${change > 0 ? "+" : ""}${formatted}%`;
}

export const formatIndexWeeklyChange = formatIndexMovementChange;
