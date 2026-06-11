"use client";

// Виджет Яндекс.Карт для ленты площадки: круги 4 км по отображаемым центрам
// объявлений (реальная точка скрыта). Ключ — NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
// без ключа/при ошибке загрузки показываем заглушку, список остаётся доступен
// (docs/08-architecture/maps-provider.md, раздел 8.3).

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";

const YANDEX_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

type YmapsMap = {
  geoObjects: { add: (object: unknown) => void; removeAll: () => void };
  setBounds: (bounds: unknown, options?: Record<string, unknown>) => void;
};
type YmapsGeoObject = { events: { add: (type: string, handler: () => void) => void } };
type YmapsApi = {
  ready: (callback: () => void) => void;
  Map: new (element: HTMLElement, options: Record<string, unknown>) => YmapsMap;
  Circle: new (
    geometry: unknown,
    properties: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => YmapsGeoObject;
  util: { bounds: { fromPoints: (points: number[][]) => unknown } };
};

declare global {
  interface Window {
    ymaps?: YmapsApi;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadYmaps(): Promise<void> {
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

export function YandexMap({
  listings,
  onSelect,
}: {
  listings: MarketplaceListingListItem[];
  onSelect?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YmapsMap | null>(null);
  const [failed, setFailed] = useState(false);

  const points = listings.filter((listing) => listing.circleLat != null && listing.circleLon != null);
  // Стабильный ключ набора точек — перерисовываем круги при изменении выборки.
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");

  useEffect(() => {
    if (!YANDEX_KEY) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    loadYmaps()
      .then(() => {
        const ymaps = window.ymaps;
        if (cancelled || !ymaps || !containerRef.current) return;
        ymaps.ready(() => {
          if (cancelled || !containerRef.current) return;
          if (!mapRef.current) {
            mapRef.current = new ymaps.Map(containerRef.current, {
              center: [55.76, 37.64],
              zoom: 5,
              controls: ["zoomControl"],
            });
          }
          drawCircles();
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  function drawCircles() {
    const ymaps = window.ymaps;
    const map = mapRef.current;
    if (!ymaps || !map) return;

    map.geoObjects.removeAll();
    const bounds: number[][] = [];
    for (const listing of points) {
      const center = [listing.circleLat as number, listing.circleLon as number];
      bounds.push(center);
      const circle = new ymaps.Circle(
        [center, MARKETPLACE_CIRCLE_RADIUS_KM * 1000],
        { hintContent: listing.positions.map((position) => position.nomenclatureName).join(", ") },
        { fillColor: "#1f8a4c2e", strokeColor: "#1f8a4c", strokeWidth: 2 },
      );
      if (onSelect) {
        circle.events.add("click", () => onSelect(listing.id));
      }
      map.geoObjects.add(circle);
    }

    if (bounds.length > 0) {
      try {
        map.setBounds(ymaps.util.bounds.fromPoints(bounds), { checkZoomRange: true, zoomMargin: 48 });
      } catch {
        // setBounds может бросить на единственной точке — оставляем дефолтный вид.
      }
    }
  }

  if (failed || !YANDEX_KEY) {
    return (
      <div className="mp-map-placeholder">
        Карта временно недоступна{YANDEX_KEY ? " (ошибка загрузки Яндекс.Карт)" : " — не задан ключ Яндекс.Карт"}.
        Объявления показаны списком ниже.
      </div>
    );
  }

  return <div ref={containerRef} className="mp-map" />;
}
