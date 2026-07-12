import type { TourDefinition } from "../tour-types";

// Обучение (/education).
export const educationTour: TourDefinition = {
  key: "education",
  steps: [
    {
      anchor: "education-continue",
      title: "Продолжить обучение",
      body: "Начатый курс всегда ждёт наверху — вернётесь ровно к тому уроку, где остановились.",
      placement: "bottom",
      optional: true,
    },
    {
      anchor: "education-grid",
      title: "Каталог курсов",
      body: "Курсы по закупке и работе с сырьём: внутри уроки с видео и материалами, прогресс сохраняется автоматически.",
      placement: "top",
    },
  ],
};
