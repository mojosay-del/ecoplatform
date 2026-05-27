import { describe, expect, it } from "vitest";
import { nextSortState, sortItems, type SortState } from "./admin-table-utils";

type SortKey = "name" | "date" | "count";

const rows = [
  { name: "Бета", date: "2026-05-02T12:00:00.000Z", count: 2 },
  { name: "Альфа 10", date: "2026-05-01T12:00:00.000Z", count: 10 },
  { name: "Альфа 2", date: "2026-05-03T12:00:00.000Z", count: 1 },
];

describe("admin table sorting", () => {
  it("toggles an active sort key and applies default direction for a new key", () => {
    const current: SortState<SortKey> = { key: "date", direction: "desc" };

    expect(nextSortState(current, "date")).toEqual({ key: "date", direction: "asc" });
    expect(nextSortState(current, "name")).toEqual({ key: "name", direction: "asc" });
    expect(nextSortState(current, "count", "desc")).toEqual({ key: "count", direction: "desc" });
  });

  it("sorts strings naturally and keeps the input immutable", () => {
    const sorted = sortItems(rows, { key: "name", direction: "asc" }, selectors);

    expect(sorted.map((row) => row.name)).toEqual(["Альфа 2", "Альфа 10", "Бета"]);
    expect(rows.map((row) => row.name)).toEqual(["Бета", "Альфа 10", "Альфа 2"]);
  });

  it("sorts numeric and date-derived values", () => {
    expect(sortItems(rows, { key: "count", direction: "desc" }, selectors).map((row) => row.count)).toEqual([10, 2, 1]);
    expect(sortItems(rows, { key: "date", direction: "desc" }, selectors).map((row) => row.name)).toEqual([
      "Альфа 2",
      "Бета",
      "Альфа 10",
    ]);
  });
});

const selectors: Record<SortKey, (row: (typeof rows)[number]) => string | number> = {
  name: (row) => row.name,
  date: (row) => Date.parse(row.date),
  count: (row) => row.count,
};
