import { describe, expect, it } from "vitest";
import { visibleAdminHomeGroups } from "./admin-panel-tabs";

describe("admin panel home groups", () => {
  it("groups admin home into Контент / Аудитория / Обращения / Система", () => {
    const labels = visibleAdminHomeGroups(["admin"]).flatMap((group) => group.items.map((item) => item.label));

    expect(labels).toEqual([
      "Новости",
      "Индексы цен",
      "Обучение",
      "База знаний",
      "Документация",
      "Форум",
      "Пользователи",
      "Компании",
      "Сотрудники",
      "Подписки",
      "Поддержка",
      "Очередь модерации",
      "Рассылка",
      "Аналитика",
      "Журнал",
      "Настройки платформы",
    ]);
  });

  it("keeps content managers on Контент home links without local tabs", () => {
    expect(
      visibleAdminHomeGroups(["content_manager"]).flatMap((group) => group.items.map((item) => item.label)),
    ).toEqual(["Новости", "Индексы цен", "Обучение", "База знаний", "Документация", "Форум"]);
  });

  it("gives moderators the forum CMS card plus moderation work", () => {
    expect(visibleAdminHomeGroups(["moderator"]).flatMap((group) => group.items.map((item) => item.label))).toEqual([
      "Форум",
      "Очередь модерации",
    ]);
  });
});
