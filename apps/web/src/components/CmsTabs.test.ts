import { describe, expect, it } from "vitest";
import { isAdminPanelTabActive, visibleAdminPanelTabs } from "./admin-panel-tabs";

describe("admin panel tabs", () => {
  it("keeps content managers inside CMS tabs only", () => {
    expect(visibleAdminPanelTabs(["content_manager"]).map((tab) => tab.label)).toEqual([
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
    ]);
  });

  it("shows admin operations and settings groups in the shared panel bar", () => {
    expect(visibleAdminPanelTabs(["admin"]).map((tab) => tab.label)).toEqual([
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
      "Пользователи",
      "Компании",
      "Сотрудники",
      "Поддержка",
      "Подписки",
      "Очередь модерации",
      "Модерация",
      "Демо-доступ",
      "Индексы",
      "Прочее",
      "Журнал",
    ]);
  });

  it("marks hash-backed settings tabs active without making settings a nested menu", () => {
    const [moderation, demo] = visibleAdminPanelTabs(["admin"]).filter((tab) => tab.pathname === "/admin/settings");

    expect(isAdminPanelTabActive(moderation!, "/admin/settings", "")).toBe(true);
    expect(isAdminPanelTabActive(moderation!, "/admin/settings", "demo")).toBe(false);
    expect(isAdminPanelTabActive(demo!, "/admin/settings", "demo")).toBe(true);
  });
});
