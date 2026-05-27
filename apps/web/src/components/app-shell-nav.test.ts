import { describe, expect, it } from "vitest";
import { COMING_SOON_BADGE, futureNavItems } from "./app-shell-nav";

describe("AppShell future navigation teasers", () => {
  it("keeps every disabled sidebar item documented as a roadmap teaser", () => {
    const items = futureNavItems();

    expect(items.map((item) => item.label)).toEqual([
      "Торговая площадка",
      "Форум",
      "Магазин",
      "Документация",
      "Карты",
      "Калькуляторы",
    ]);

    for (const item of items) {
      expect(item.disabledBadge).toBe(COMING_SOON_BADGE);
      expect(item.disabledHint).toContain("—");
      expect(item.href).toBeUndefined();
    }
  });
});
