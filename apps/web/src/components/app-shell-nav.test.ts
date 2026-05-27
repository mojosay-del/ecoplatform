import { describe, expect, it } from "vitest";
import { appNavSections, COMING_SOON_BADGE, futureNavItems } from "./app-shell-nav";

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

  it("keeps admin routes behind one panel entry in the sidebar", () => {
    const serviceSection = appNavSections.find((section) => section.title === "Служебное");

    expect(serviceSection?.items.map((item) => item.label)).toEqual(["Панель управления"]);
    expect(serviceSection?.items[0]?.activePathPrefixes).toEqual(["/admin"]);
  });
});
