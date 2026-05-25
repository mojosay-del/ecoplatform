export type PriceIndexPoint = {
  date: string | Date;
  price: number;
};

export type PriceIndexSummary = {
  currentPrice: number;
  currentDate: Date;
  weeklyChange: number | null;
  trend: "growth" | "stagnation" | "fall" | null;
};

function toDateOnly(value: string | Date): Date {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function byDateAsc(a: PriceIndexPoint, b: PriceIndexPoint): number {
  return toDateOnly(a.date).getTime() - toDateOnly(b.date).getTime();
}

export function summarizePriceIndex(
  points: PriceIndexPoint[],
  now = new Date(),
  stagnationThreshold = 1,
): PriceIndexSummary | null {
  const today = toDateOnly(now).getTime();
  const actualPoints = points.filter((point) => toDateOnly(point.date).getTime() <= today).sort(byDateAsc);

  if (actualPoints.length === 0) {
    return null;
  }

  const current = actualPoints[actualPoints.length - 1];

  if (!current) {
    return null;
  }

  const currentDate = toDateOnly(current.date);
  const weekAgo = currentDate.getTime() - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = currentDate.getTime() - 14 * 24 * 60 * 60 * 1000;

  // Если точного значения неделю назад нет, берём ближайшую более раннюю точку
  // в 14-дневном окне. Это отражает продуктовую договорённость по индексам.
  const previous = [...actualPoints].reverse().find((point) => {
    const time = toDateOnly(point.date).getTime();
    return time <= weekAgo && time >= twoWeeksAgo;
  });

  if (!previous) {
    return {
      currentPrice: current.price,
      currentDate,
      weeklyChange: null,
      trend: null,
    };
  }

  const weeklyChange = Number((((current.price - previous.price) / previous.price) * 100).toFixed(1));
  const trend =
    weeklyChange > stagnationThreshold ? "growth" : weeklyChange < -stagnationThreshold ? "fall" : "stagnation";

  return {
    currentPrice: current.price,
    currentDate,
    weeklyChange,
    trend,
  };
}

export function filterPriceIndexPoints(
  points: PriceIndexPoint[],
  periodDays: number,
  now = new Date(),
): PriceIndexPoint[] {
  const today = toDateOnly(now).getTime();
  const since = today - periodDays * 24 * 60 * 60 * 1000;

  return points
    .filter((point) => {
      const time = toDateOnly(point.date).getTime();
      return time >= since && time <= today;
    })
    .sort(byDateAsc);
}
