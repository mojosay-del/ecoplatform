import type { TourDefinition } from "../tour-types";

// База знаний по сырью (/knowledge-base).
export const knowledgeBaseTour: TourDefinition = {
  key: "knowledge-base",
  steps: [
    {
      anchor: "kb-search",
      title: "Поиск по архиву",
      body: "Ищите материал по названию или коду — каталог отфильтруется на лету.",
      placement: "bottom",
    },
    {
      anchor: "kb-rail",
      title: "Указатель категорий",
      body: "Лента-указатель ведёт по разделам архива и подсвечивает, где вы сейчас находитесь.",
      placement: "bottom",
      optional: true,
    },
    {
      anchor: "kb-sections",
      title: "Листы образцов",
      body: "Каждая карточка — паспорт сырья: описание, признаки качества и требования к приёмке.",
      placement: "top",
    },
  ],
};
