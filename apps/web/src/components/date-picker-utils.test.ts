import { describe, expect, it } from "vitest";
import { buildMonthGrid, formatRuDate, parseIsoDate, toIsoDate } from "./date-picker-utils";

describe("date-picker-utils", () => {
  it("toIsoDate использует локальные y/m/d без сдвига по TZ", () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toIsoDate(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("parseIsoDate разбирает корректную дату и отклоняет мусор", () => {
    expect(parseIsoDate("2026-06-07")).toEqual({ year: 2026, month: 5, day: 7 });
    expect(parseIsoDate("07.06.2026")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
  });

  it("formatRuDate приводит ISO к дд.мм.гггг", () => {
    expect(formatRuDate("2026-06-07")).toBe("07.06.2026");
    expect(formatRuDate("")).toBe("");
  });

  it("buildMonthGrid: 42 ячейки, неделя с понедельника, помечает чужие дни", () => {
    // Июнь 2026: 1 июня — понедельник, значит первая ячейка = 1 июня.
    const grid = buildMonthGrid(2026, 5);
    expect(grid).toHaveLength(42);
    expect(grid[0]!.iso).toBe("2026-06-01");
    expect(grid[0]!.inMonth).toBe(true);
    // 30 июня — последний день месяца (вторник), дальше дни июля (чужие).
    const lastInMonth = grid.filter((cell) => cell.inMonth);
    expect(lastInMonth.at(-1)!.iso).toBe("2026-06-30");
    expect(grid.at(-1)!.inMonth).toBe(false);
  });
});
