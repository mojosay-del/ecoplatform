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

// SVG-булавка с иконкой кипы (для сильного отдаления карты). Цвет — по сырью.
// Возвращаем data-URI для iconImageHref Яндекс-плейсмарка.
export function balecasePinDataUri(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="42" viewBox="0 0 32 42">
<path d="M16 0C8 0 1 6 1 15c0 11 15 27 15 27s15-16 15-27C31 6 24 0 16 0Z" fill="${color}"/>
<circle cx="16" cy="15" r="10" fill="#ffffff"/>
<g fill="none" stroke="${color}" stroke-width="1.7">
<rect x="10.5" y="10.5" width="11" height="9" rx="1.2"/>
<line x1="10.5" y1="13.5" x2="21.5" y2="13.5"/>
<line x1="10.5" y1="16.5" x2="21.5" y2="16.5"/>
<line x1="16" y1="10.5" x2="16" y2="19.5"/>
</g>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
