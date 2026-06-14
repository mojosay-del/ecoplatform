import { describe, expect, it } from "vitest";
import { visibleAdminHomeGroups } from "./admin-panel-tabs";

describe("admin panel home groups", () => {
  it("keeps CMS, operations and settings on the panel home", () => {
    const labels = visibleAdminHomeGroups(["admin"]).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toEqual([
      "Аналитика",
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
      "Документация",
      "Пользователи",
      "Компании",
      "Сотрудники",
      "Поддержка",
      "Подписки",
      "Очередь модерации",
      "Журнал",
      "Настройки платформы",
    ]);
  });

  it("keeps content managers on CMS home links without local tabs", () => {
    expect(
      visibleAdminHomeGroups(["content_manager"]).flatMap((group) => group.items.map((item) => item.label)),
    ).toEqual(["Новости", "Индексы цен", "Обучение", "База знаний", "Документация"]);
  });

  it("limits moderator home navigation to moderation work", () => {
    expect(visibleAdminHomeGroups(["moderator"]).flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "Очередь модерации",
    ]);
  });
});
