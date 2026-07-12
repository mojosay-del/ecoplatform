import type { TourDefinition } from "../tour-types";

// Калькулятор заявки (/calculators/retail), только collector-компании.
export const calculatorRetailTour: TourDefinition = {
  key: "calculator-retail",
  steps: [
    {
      anchor: "tc-vehicles",
      title: "Ваш транспорт",
      body: "Добавьте свои машины с расходом топлива — расчёт сразу учтёт стоимость каждого километра.",
      placement: "bottom",
    },
    {
      anchor: "tc-request",
      title: "Параметры заявки",
      body: "Сырьё, вес, цены и расстояние — введите данные заявки, которую оцениваете.",
      placement: "right",
    },
    {
      anchor: "tc-verdict",
      title: "Вердикт рейса",
      body: "Калькулятор сравнит выручку с расходами и сразу скажет, стоит ли ехать — с прибылью за час.",
      placement: "bottom",
    },
  ],
};
