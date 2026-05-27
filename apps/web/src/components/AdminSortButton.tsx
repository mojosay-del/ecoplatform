"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { nextSortState, type SortDirection, type SortState } from "./admin-table-utils";

type AdminSortButtonProps<TKey extends string> = {
  label: string;
  sortKey: TKey;
  sort: SortState<TKey>;
  defaultDirection?: SortDirection;
  onSort: (sort: SortState<TKey>) => void;
};

export function AdminSortButton<TKey extends string>({
  label,
  sortKey,
  sort,
  defaultDirection,
  onSort,
}: AdminSortButtonProps<TKey>) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    <button
      aria-label={`Сортировать: ${label}`}
      aria-pressed={active}
      className={`admin-sort-button${active ? " active" : ""}`}
      onClick={() => onSort(nextSortState(sort, sortKey, defaultDirection))}
      type="button"
    >
      <span>{label}</span>
      <Icon aria-hidden size={14} />
    </button>
  );
}
