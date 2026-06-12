// Единый загрузчик Яндекс.Карт (JS API 2.1) + SVG-иконки карты. Используется и
// картой ленты (YandexMap), и подсказками адреса в форме (SuggestView) — чтобы
// не дублировать тег скрипта и типы. Цвета по сырью — в ./materials (общие с
// чипами/легендой). Ключ — NEXT_PUBLIC_YANDEX_MAPS_API_KEY; без него
// карта/подсказки деградируют в заглушку (см. вызовы).

export const YANDEX_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

export type YmapsGeoObject = {
  events: { add: (type: string, handler: () => void) => void };
  // Смена стиля без пересоздания объекта (подсветка hover из ленты).
  options: { set: (options: Record<string, unknown>) => void };
};
export type YmapsClusterer = YmapsGeoObject & {
  add: (objects: YmapsGeoObject | YmapsGeoObject[]) => YmapsClusterer;
  removeAll: () => YmapsClusterer;
};
export type YmapsMap = {
  geoObjects: { add: (object: unknown) => void; remove: (object: unknown) => void; removeAll: () => void };
  setCenter: (center: number[], zoom?: number, options?: Record<string, unknown>) => void;
  setBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  getZoom: () => number;
  // Видимая область [[swLat, swLon], [neLat, neLon]] — для «Искать в области».
  getBounds: () => number[][];
  events: { add: (type: string, handler: () => void) => void };
  // Пересчёт под новый размер контейнера (нужно при сворачивании сайдбара —
  // грид-колонка расширяется, но канвас карты сам не реагирует).
  container: { fitToViewport: () => void };
  destroy: () => void;
};
export type YmapsSuggestView = {
  events: { add: (type: string, handler: (event: { get: (key: string) => unknown }) => void) => void };
  destroy: () => void;
};
// Геокод-объект: методы извлечения частей адреса (см. doc Geocoder JS API).
export type YmapsGeoResult = {
  geoObjects: {
    get: (index: number) =>
      | {
          getAddressLine: () => string;
          getAdministrativeAreas: () => string[];
          getLocalities: () => string[];
          getThoroughfare: () => string;
          getPremiseNumber: () => string;
          properties: { get: (key: string, fallback: unknown) => unknown };
        }
      | undefined;
  };
};
export type Ymaps = {
  ready: (callback: () => void) => void;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => YmapsMap;
  Circle: new (
    geometry: unknown,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => YmapsGeoObject;
  Placemark: new (
    geometry: number[],
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => YmapsGeoObject;
  Clusterer: new (options?: Record<string, unknown>) => YmapsClusterer;
  SuggestView: new (element: HTMLInputElement | string, options?: Record<string, unknown>) => YmapsSuggestView;
  geocode: (request: string, options?: Record<string, unknown>) => Promise<YmapsGeoResult>;
  util: { bounds: { fromPoints: (points: number[][]) => unknown } };
};

declare global {
  interface Window {
    ymaps?: Ymaps;
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadYmaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.ymaps) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(YANDEX_KEY ?? "")}&lang=ru_RU`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("ymaps load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Маленькая точка с белым кольцом — для дальнего масштаба, чтобы карта не
// загромождалась деталями. Размер 14×14; подсвеченная (hover карточки в
// ленте) — 20×20 с полупрозрачным ореолом в цвет сырья.
export function dotDataUri(color: string, highlighted = false): string {
  if (!highlighted) {
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">` +
        `<circle cx="7" cy="7" r="4.6" fill="${color}" stroke="#fff" stroke-width="2"/>` +
        `</svg>`,
    );
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">` +
      `<circle cx="10" cy="10" r="9.4" fill="${color}40"/>` +
      `<circle cx="10" cy="10" r="5.6" fill="${color}" stroke="#fff" stroke-width="2.4"/>` +
      `</svg>`,
  );
}

// Пульсирующая точка свежего объявления (<24ч): SMIL-анимация в data URI —
// layout default#image рендерится <img>-оверлеем, SMIL там работает; для
// prefers-reduced-motion вызывающий код подставляет обычную точку.
export function pulseDotDataUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">` +
      `<circle cx="14" cy="14" r="5" fill="${color}" stroke="#fff" stroke-width="2"/>` +
      `<circle cx="14" cy="14" r="6" fill="none" stroke="${color}" stroke-width="2" opacity="0.8">` +
      `<animate attributeName="r" values="6;13" dur="1.6s" repeatCount="indefinite"/>` +
      `<animate attributeName="opacity" values="0.8;0" dur="1.6s" repeatCount="indefinite"/>` +
      `</circle>` +
      `</svg>`,
  );
}
