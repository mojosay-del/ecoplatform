import { describe, expect, it } from "vitest";
import { appNavSections, futureNavItems, getBreadcrumbTrail } from "./app-shell-nav";

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
      expect(item.disabledHint).toContain("—");
      expect(item.href).toBeUndefined();
    }
  });

  it("keeps admin routes behind one panel entry in the sidebar", () => {
    const serviceSection = appNavSections.find((section) => section.title === "Служебное");

    expect(serviceSection?.items.map((item) => item.label)).toEqual(["Панель управления"]);
    expect(serviceSection?.items[0]?.activePathPrefixes).toEqual(["/admin"]);
  });

  it("builds regular breadcrumbs from the visible sidebar section", () => {
    const trail = getBreadcrumbTrail(appNavSections, "/news");

    expect(trail?.map((item) => item.label)).toEqual(["Главная", "Новости"]);
    expect(trail?.[1]?.href).toBe("/news");
  });

  it("builds nested breadcrumbs for admin content pages", () => {
    const trail = getBreadcrumbTrail(appNavSections, "/admin/content/knowledge-base");

    expect(trail?.map((item) => item.label)).toEqual(["Панель управления", "CMS", "База знаний"]);
    expect(trail?.[0]?.href).toBe("/admin");
    expect(trail?.[2]?.href).toBe("/admin/content/knowledge-base");
  });

  it("treats /admin as the panel home instead of a CMS route", () => {
    const trail = getBreadcrumbTrail(appNavSections, "/admin");

    expect(trail?.map((item) => item.label)).toEqual(["Панель управления"]);
  });

  it("keeps admin child routes under their parent breadcrumb", () => {
    const trail = getBreadcrumbTrail(appNavSections, "/admin/support/tickets/case-id");

    expect(trail?.map((item) => item.label)).toEqual(["Панель управления", "Поддержка"]);
    expect(trail?.[1]?.href).toBe("/admin/support");
  });
});
