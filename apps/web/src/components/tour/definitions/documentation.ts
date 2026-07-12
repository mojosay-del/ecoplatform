import type { TourDefinition } from "../tour-types";

// Документация (/documentation).
export const documentationTour: TourDefinition = {
  key: "documentation",
  steps: [
    {
      anchor: "doc-search",
      title: "Поиск по реестру",
      body: "Найдите документ по названию или коду формы — не листая разделы вручную.",
      placement: "bottom",
    },
    {
      anchor: "doc-essentials",
      title: "Часто нужные",
      body: "Закреплённая полка с документами, которые запрашивают чаще всего, — всегда под рукой.",
      placement: "bottom",
      optional: true,
    },
    {
      anchor: "doc-sections",
      title: "Дела реестра",
      body: "Документы разложены по разделам: у каждого — формат, версия и кнопка скачивания.",
      placement: "top",
    },
  ],
};
