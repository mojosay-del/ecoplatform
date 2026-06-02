import { describe, expect, it } from "vitest";
import {
  accountSectionFromHref,
  appNavSections,
  futureNavItems,
  getAccountNavSections,
  getBreadcrumbTrail,
  getLegacyAccountTabHref,
  isAccountPath,
} from "./app-shell-nav";

describe("AppShell future navigation teasers", () => {
  it("keeps every disabled sidebar item documented as a roadmap teaser", () => {
    const items = futureNavItems();

    expect(items.map((item) => item.label)).toEqual(["Форум", "Документация", "Карты", "Калькуляторы"]);

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

  it("keeps account and notification links out of the global sidebar", () => {
    const labels = appNavSections.flatMap((section) => section.items.map((item) => item.label));
    const hrefs = appNavSections.flatMap((section) => section.items.map((item) => item.href));

    expect(labels).not.toContain("Личный кабинет");
    expect(labels).not.toContain("Уведомления");
    expect(hrefs).not.toContain("/account");
    expect(hrefs).not.toContain("/notifications");
  });

  it("builds the account settings sidebar with business links for regular users", () => {
    const sections = getAccountNavSections(true);

    expect(sections.map((section) => section.title)).toEqual(["Переход", "Настройки", "Компания"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual(["К платформе"]);
    expect(sections[1]?.items.map((item) => item.label)).toEqual([
      "Профиль",
      "Безопасность",
      "Уведомления",
      "Данные и приватность",
      "Сессии",
    ]);
    expect(sections[2]?.items.map((item) => item.label)).toEqual(["Компания", "Подписка", "Поддержка"]);
  });

  it("hides business account links for platform staff", () => {
    const sections = getAccountNavSections(false);

    expect(sections.map((section) => section.title)).toEqual(["Переход", "Настройки"]);
    expect(sections.flatMap((section) => section.items.map((item) => item.href))).not.toContain("/account/billing");
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

  it("builds account breadcrumbs and detects account routes", () => {
    const trail = getBreadcrumbTrail(getAccountNavSections(true), "/account/data-privacy");

    expect(isAccountPath("/account/security")).toBe(true);
    expect(isAccountPath("/news")).toBe(false);
    expect(trail?.map((item) => item.label)).toEqual(["Настройки аккаунта", "Данные и приватность"]);
    expect(trail?.[0]?.href).toBe("/account/profile");
    expect(trail?.[1]?.href).toBe("/account/data-privacy");
  });

  it("maps legacy account tab query values to direct routes", () => {
    expect(getLegacyAccountTabHref("security")).toBe("/account/security");
    expect(getLegacyAccountTabHref("billing")).toBe("/account/billing");
    expect(getLegacyAccountTabHref("support")).toBe("/account/support");
    expect(getLegacyAccountTabHref("unknown")).toBeNull();
  });

  it("parses account section links for scroll navigation", () => {
    expect(accountSectionFromHref("/account")).toBe("profile");
    expect(accountSectionFromHref("/account/billing")).toBe("billing");
    expect(accountSectionFromHref("/account/sessions?from=menu")).toBe("sessions");
    expect(accountSectionFromHref("/account/support/thread")).toBe("support");
    expect(accountSectionFromHref("/news")).toBeNull();
  });
});
