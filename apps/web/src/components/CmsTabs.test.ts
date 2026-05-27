import { describe, expect, it } from "vitest";
import { isCmsTabActive, visibleAdminHomeGroups, visibleCmsTabs } from "./admin-panel-tabs";

describe("admin panel tabs", () => {
  it("keeps content managers inside CMS tabs only", () => {
    expect(visibleCmsTabs(["content_manager"]).map((tab) => tab.label)).toEqual([
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
    ]);
  });

  it("keeps admin CMS tabs focused on content sections", () => {
    expect(visibleCmsTabs(["admin"]).map((tab) => tab.label)).toEqual([
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
    ]);
  });

  it("moves admin operations and settings to the panel home groups", () => {
    const labels = visibleAdminHomeGroups(["admin"]).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toEqual([
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
      "Журнал",
      "Демо-доступ",
      "Индексы",
      "Прочее",
    ]);
  });

  it("limits moderator home navigation to moderation work", () => {
    expect(visibleAdminHomeGroups(["moderator"]).flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "Очередь модерации",
    ]);
  });

  it("marks CMS routes active without settings hash logic", () => {
    const [news, indices] = visibleCmsTabs(["admin"]);

    expect(isCmsTabActive(news!, "/admin/content/news", "")).toBe(true);
    expect(isCmsTabActive(news!, "/admin/content/news/edit-id", "")).toBe(true);
    expect(isCmsTabActive(indices!, "/admin/content/news", "")).toBe(false);
  });
});
