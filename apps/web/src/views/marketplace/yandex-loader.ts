// Единый загрузчик Яндекс.Карт (JS API 2.1) + цвета по сырью. Используется и
// картой ленты (YandexMap), и подсказками адреса в форме (SuggestView) — чтобы
// не дублировать тег скрипта и типы. Ключ — NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
// без него карта/подсказки деградируют в заглушку (см. вызовы).

export const YANDEX_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

export type YmapsGeoObject = { events: { add: (type: string, handler: () => void) => void } };
export type YmapsMap = {
  geoObjects: { add: (object: unknown) => void; remove: (object: unknown) => void; removeAll: () => void };
  setBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
  getZoom: () => number;
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

// Цвет по категории сырья (как просил владелец): макулатура — коричневый,
// плёнки — синий, полимеры/пластики — жёлтый; прочее — зелёный Ecoplatform.
export function materialColor(categorySlug: string | undefined): string {
  switch (categorySlug) {
    case "makulatura":
      return "#8a5a2b";
    case "plenki":
      return "#1f6fb8";
    case "plastiki":
      return "#d9a300";
    default:
      return "#1f8a4c";
  }
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Аккуратная булавка-капля с белой обводкой (читается на любой подложке) и
// минималистичным глифом «кипа» (скруглённый квадрат + стяжка) в цвет сырья.
// Для среднего масштаба карты. Размер 30×38.
export function pinDataUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">` +
      `<path d="M15 37s12-11.8 12-22A12 12 0 1 0 3 15c0 10.2 12 22 12 22Z" fill="${color}" stroke="#fff" stroke-width="1.6"/>` +
      `<circle cx="15" cy="14" r="7.2" fill="#fff"/>` +
      `<rect x="11.2" y="10.2" width="7.6" height="7.6" rx="1.6" fill="none" stroke="${color}" stroke-width="1.5"/>` +
      `<line x1="11.2" y1="14" x2="18.8" y2="14" stroke="${color}" stroke-width="1.5"/>` +
      `</svg>`,
  );
}

// Маленькая точка с белым кольцом — для СИЛЬНОГО отдаления, чтобы точки не
// загромождали карту. Размер 14×14.
export function dotDataUri(color: string): string {
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14">` +
      `<circle cx="7" cy="7" r="4.6" fill="${color}" stroke="#fff" stroke-width="2"/>` +
      `</svg>`,
  );
}
