export type SortDirection = "asc" | "desc";

export type SortState<TKey extends string> = {
  key: TKey;
  direction: SortDirection;
};

export type SortValue = string | number | boolean | null | undefined;

export function nextSortState<TKey extends string>(
  current: SortState<TKey>,
  key: TKey,
  defaultDirection: SortDirection = "asc",
): SortState<TKey> {
  if (current.key !== key) {
    return { key, direction: defaultDirection };
  }

  return { key, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function sortItems<TItem, TKey extends string>(
  items: readonly TItem[],
  sort: SortState<TKey>,
  selectors: Record<TKey, (item: TItem) => SortValue>,
): TItem[] {
  const selector = selectors[sort.key];
  const direction = sort.direction === "asc" ? 1 : -1;

  return [...items].sort((left, right) => compareSortValues(selector(left), selector(right)) * direction);
}

export function compareSortValues(left: SortValue, right: SortValue): number {
  if (left === right) return 0;
  if (left === null || left === undefined || left === "") return 1;
  if (right === null || right === undefined || right === "") return -1;

  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  if (typeof left === "boolean" && typeof right === "boolean") {
    return Number(left) - Number(right);
  }

  return String(left).localeCompare(String(right), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}
