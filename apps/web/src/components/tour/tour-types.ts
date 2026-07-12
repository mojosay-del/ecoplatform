import type { OnboardingTourKey } from "@ecoplatform/shared";

// Сторона карточки-подсказки относительно цели. floating-ui сам перевернёт
// её (flip), если с выбранной стороны не хватает места.
export type TourPlacement = "top" | "bottom" | "left" | "right";

export type TourStep = {
  // Якорь цели: элемент с data-tour="<anchor>". Уникален в рамках тура.
  anchor: string;
  title: string;
  body: string;
  placement?: TourPlacement;
  // Отступ выреза спотлайта вокруг цели, px (default 8).
  padding?: number;
  // Скругление выреза, px (default 14).
  radius?: number;
  // Опциональный шаг молча пропускается, если якоря нет в DOM (пустое
  // состояние, необязательный блок). Отсутствие ОБЯЗАТЕЛЬНОГО якоря
  // откладывает автозапуск тура целиком — отметка не сжигается.
  optional?: boolean;
  // Шагу нужен видимый сайдбар: на мобильном открывается drawer, на десктопе
  // разворачивается свёрнутое меню (транзиентно, localStorage не трогаем).
  needsNav?: boolean;
};

export type TourDefinition = {
  key: OnboardingTourKey;
  steps: TourStep[];
};

// auto — первый визит (закрытие фиксирует прохождение в БД);
// manual — повтор через «?» у заголовка (ничего не постит).
export type TourMode = "auto" | "manual";
