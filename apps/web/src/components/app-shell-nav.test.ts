import { describe, expect, it } from "vitest";
import type { CompanyType } from "@ecoplatform/shared";
import { filterVisibleItems } from "./app-shell/nav-utils";
import {
  accountProfileModalFromHref,
  accountSectionFromHref,
  appNavSections,
  futureNavItems,
  getAccountMenuSections,
  getAccountNavSections,
  getBreadcrumbTrail,
  getLegacyAccountTabHref,
  isAccountPath,
} from "./app-shell-nav";

describe("AppShell future navigation teasers", () => {
  it("keeps every disabled sidebar item documented as a roadmap teaser", () => {
    const items = futureNavItems();

    expect(items.map((item) => item.label)).toEqual(["Карты"]);

    for (const item of items) {
      expect(item.disabledHint).toContain("—");
      expect(item.href).toBeUndefined();
    }
  });

  it("hides marketplace listings while the feature is disabled", () => {
    const labelsFor = (companyType: CompanyType | null, roles: string[] = [], marketplace = false) =>
      appNavSections.flatMap((section) =>
        filterVisibleItems(section.items, { roles, companyType, features: { marketplace } }).map((item) => item.label),
      );

    expect(labelsFor("collector")).not.toContain("Объявления");
    expect(labelsFor("trader")).not.toContain("Объявления");
    expect(labelsFor("processor")).not.toContain("Объявления");
    expect(labelsFor(null, ["content_manager"])).not.toContain("Объявления");
    expect(labelsFor("collector", [], true)).toContain("Объявления");
    expect(labelsFor("trader", [], true)).toContain("Объявления");
    expect(labelsFor("processor", [], true)).toContain("Объявления");
    expect(labelsFor(null, ["content_manager"], true)).toContain("Объявления");
  });

  it("keeps admin routes behind one panel entry in the sidebar", () => {
    const serviceSection = appNavSections.find((section) => section.title === "Служебное");

    expect(serviceSection?.items.map((item) => item.label)).toEqual(["Панель управления"]);
    expect(serviceSection?.items[0]?.activePathPrefixes).toEqual(["/admin"]);
  });

  it("shows education only to collectors among regular users", () => {
    const labelsFor = (companyType: CompanyType | null, roles: string[] = []) =>
      appNavSections.flatMap((section) =>
        filterVisibleItems(section.items, { roles, companyType }).map((item) => item.label),
      );

    expect(labelsFor("collector")).toContain("Обучение");
    expect(labelsFor("trader")).not.toContain("Обучение");
    expect(labelsFor("processor")).not.toContain("Обучение");
    expect(labelsFor(null, ["content_manager"])).toContain("Обучение");
  });

  it("shows the retail calculator only to collectors among regular users", () => {
    const labelsFor = (companyType: CompanyType | null, roles: string[] = []) =>
      appNavSections.flatMap((section) =>
        filterVisibleItems(section.items, { roles, companyType }).map((item) => item.label),
      );

    expect(labelsFor("collector")).toContain("Розничный");
    expect(labelsFor("trader")).not.toContain("Розничный");
    expect(labelsFor("processor")).not.toContain("Розничный");
    expect(labelsFor(null, ["content_manager"])).toContain("Розничный");
  });

  it("keeps account and notification links out of the global sidebar", () => {
    const labels = appNavSections.flatMap((section) => section.items.map((item) => item.label));
    const hrefs = appNavSections.flatMap((section) => section.items.map((item) => item.href));

    expect(labels).not.toContain("Личный кабинет");
    expect(labels).not.toContain("Уведомления");
    expect(hrefs).not.toContain("/account");
    expect(hrefs).not.toContain("/notifications");
  });

  it("builds the account settings sidebar", () => {
    const sections = getAccountNavSections();

    expect(sections.map((section) => section.title)).toEqual(["Переход", "Настройки"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual(["К платформе"]);
    expect(sections[1]?.items.map((item) => item.label)).toEqual(["Профиль", "Данные и приватность"]);
  });

  it("builds the account topbar menu with profile modal links for regular users", () => {
    const sections = getAccountMenuSections(true);

    expect(sections.map((section) => section.title)).toEqual(["Настройки"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual(["Профиль", "Подписка", "Сессии", "Уведомления"]);
    expect(sections[0]?.items.map((item) => item.href)).toEqual([
      "/account/profile",
      "/account/profile?modal=subscription",
      "/account/profile?modal=sessions",
      "/account/profile?modal=notifications",
    ]);
  });

  it("keeps legacy business account links out of the settings sidebar", () => {
    const sections = getAccountNavSections();

    expect(sections.map((section) => section.title)).toEqual(["Переход", "Настройки"]);
    expect(sections.flatMap((section) => section.items.map((item) => item.href))).not.toContain("/account/support");
  });

  it("keeps the account topbar menu minimal for platform staff", () => {
    const sections = getAccountMenuSections(false);

    expect(sections.map((section) => section.title)).toEqual(["Настройки"]);
    expect(sections[0]?.items.map((item) => item.label)).toEqual(["Профиль"]);
    expect(sections[0]?.items.map((item) => item.href)).toEqual(["/account/profile"]);
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
    const trail = getBreadcrumbTrail(getAccountNavSections(), "/account/data-privacy");

    expect(isAccountPath("/account/security")).toBe(true);
    expect(isAccountPath("/news")).toBe(false);
    expect(trail?.map((item) => item.label)).toEqual(["Настройки аккаунта"]);
    expect(trail?.[0]?.href).toBe("/account/profile");
  });

  it("maps legacy account tab query values to direct routes", () => {
    expect(getLegacyAccountTabHref("security")).toBe("/account/profile");
    expect(getLegacyAccountTabHref("company")).toBe("/account/profile");
    expect(getLegacyAccountTabHref("billing")).toBe("/account/profile?modal=subscription");
    expect(getLegacyAccountTabHref("sessions")).toBe("/account/profile?modal=sessions");
    expect(getLegacyAccountTabHref("notifications")).toBe("/account/profile?modal=notifications");
    expect(getLegacyAccountTabHref("support")).toBe("/account/profile");
    expect(getLegacyAccountTabHref("unknown")).toBeNull();
  });

  it("parses profile modal links from account menu hrefs", () => {
    expect(accountProfileModalFromHref("/account/profile?modal=subscription")).toBe("subscription");
    expect(accountProfileModalFromHref("/account/profile?modal=sessions")).toBe("sessions");
    expect(accountProfileModalFromHref("/account/profile?modal=notifications")).toBe("notifications");
    expect(accountProfileModalFromHref("/account/profile?modal=unknown")).toBeNull();
  });

  it("parses account section links for scroll navigation", () => {
    expect(accountSectionFromHref("/account")).toBe("profile");
    expect(accountSectionFromHref("/account/billing")).toBeNull();
    expect(accountSectionFromHref("/account/sessions?from=menu")).toBeNull();
    expect(accountSectionFromHref("/account/notifications")).toBeNull();
    expect(accountSectionFromHref("/account/support/thread")).toBeNull();
    expect(accountSectionFromHref("/news")).toBeNull();
  });
});
