import type { TourDefinition } from "../tour-types";

// Форум (/forum).
export const forumTour: TourDefinition = {
  key: "forum",
  steps: [
    {
      anchor: "forum-search",
      title: "Сначала — поиск",
      body: "Возможно, ваш вопрос уже обсуждали и готовый ответ ждёт в архиве форума.",
      placement: "bottom",
    },
    {
      anchor: "forum-filters",
      title: "Фильтры ленты",
      body: "Сузьте вопросы по виду сырья и типу — останется только то, что касается вашей работы.",
      placement: "bottom",
    },
    {
      anchor: "forum-sort",
      title: "Свежее или активное",
      body: "Переключатель сортировки: новые вопросы или обсуждения, где сейчас кипит жизнь.",
      placement: "bottom",
    },
    {
      anchor: "forum-ask",
      title: "Задать вопрос",
      body: "Не нашли ответа — спросите сообщество: помогают коллеги, которые уже сталкивались с таким.",
      placement: "left",
      optional: true,
    },
  ],
};
