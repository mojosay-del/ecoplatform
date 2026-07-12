import type { TourDefinition } from "../tour-types";

// Индексы цен (/indices).
export const indicesTour: TourDefinition = {
  key: "indices",
  steps: [
    {
      anchor: "indices-pulse",
      title: "Пульс рынка",
      body: "Настроение рынка и лидер недели — быстрый срез того, куда движутся цены прямо сейчас.",
      placement: "bottom",
    },
    {
      anchor: "indices-summary",
      title: "Сводка движения",
      body: "Кто вырос, кто просел — таблица за выбранный период. Период меняется переключателем справа.",
      placement: "bottom",
    },
    {
      anchor: "indices-grid",
      title: "Карточки индексов",
      body: "У каждого вида сырья — график и история цены. Открывайте карточку, чтобы рассмотреть динамику подробнее.",
      placement: "top",
    },
  ],
};
