import type { NomenclatureListItem } from "@ecoplatform/shared";

export type IndexMovementRow = {
  item: NomenclatureListItem;
  weeklyChange: number;
};

export type IndexMovementSummary = {
  rising: IndexMovementRow[];
  falling: IndexMovementRow[];
};

export function getIndexAnchorId(id: string) {
  return `index-${id}`;
}

export function getIndexMovementSummary(items: NomenclatureListItem[], limit = 3): IndexMovementSummary {
  const movements = items.flatMap((item) => {
    const weeklyChange = Number(item.summary?.weeklyChange);

    if (!Number.isFinite(weeklyChange) || weeklyChange === 0) {
      return [];
    }

    return [{ item, weeklyChange }];
  });

  return {
    rising: movements
      .filter((movement) => movement.weeklyChange > 0)
      .sort((a, b) => b.weeklyChange - a.weeklyChange)
      .slice(0, limit),
    falling: movements
      .filter((movement) => movement.weeklyChange < 0)
      .sort((a, b) => a.weeklyChange - b.weeklyChange)
      .slice(0, limit),
  };
}

export function formatIndexWeeklyChange(weeklyChange: number) {
  const formatted = weeklyChange.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });

  return `${weeklyChange > 0 ? "+" : ""}${formatted}%`;
}
