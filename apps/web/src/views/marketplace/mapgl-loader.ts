// Единый загрузчик 2ГИС MapGL JS API + минимальные типы под наш сценарий
// (карта ленты ListingMap: круги 4 км + DOM-точки). Ключ —
// NEXT_PUBLIC_DGIS_MAPS_API_KEY; без него карта деградирует в заглушку (см.
// ListingMap). Цвета по сырью — в ./materials (общие с чипами/легендой); стили
// точек — в marketplace.css. ВАЖНО: MapGL принимает координаты в порядке
// [lon, lat] (GeoJSON), в отличие от [lat, lon] Яндекса.

export const DGIS_MAPS_KEY = process.env.NEXT_PUBLIC_DGIS_MAPS_API_KEY;

export type MapglLngLat = [number, number]; // [lon, lat]

export type MapglBounds = { northEast: MapglLngLat; southWest: MapglLngLat };

export type MapglCircle = {
  on: (type: string, handler: (event?: unknown) => void) => void;
  destroy: () => void;
};
export type MapglHtmlMarker = {
  destroy: () => void;
};
export type MapglMap = {
  on: (type: string, handler: (event?: unknown) => void) => void;
  getZoom: () => number;
  getBounds: () => MapglBounds;
  setCenter: (center: MapglLngLat) => void;
  setZoom: (zoom: number) => void;
  fitBounds: (bounds: MapglBounds, options?: Record<string, unknown>) => void;
  destroy: () => void;
};
export type Mapgl = {
  Map: new (container: HTMLElement | string, options: Record<string, unknown>) => MapglMap;
  Circle: new (map: MapglMap, options: Record<string, unknown>) => MapglCircle;
  HtmlMarker: new (map: MapglMap, options: Record<string, unknown>) => MapglHtmlMarker;
};

declare global {
  interface Window {
    mapgl?: Mapgl;
  }
}

const MAPGL_API_URL = "https://mapgl.2gis.com/api/js/v1";

let scriptPromise: Promise<void> | null = null;

export function loadMapgl(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.mapgl) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = MAPGL_API_URL;
    script.async = true;
    script.onload = () => {
      // MapGL вешает глобал window.mapgl синхронно к onload.
      if (window.mapgl) resolve();
      else reject(new Error("mapgl namespace missing"));
    };
    script.onerror = () => reject(new Error("mapgl load failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}
