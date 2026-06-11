"use client";

// Виджет Яндекс.Карт для ленты площадки. Цвет элемента — по сырью (макулатура/
// плёнки/полимеры). Три масштаба для читаемости: близко — круг 4 км (реальная
// точка скрыта), средне — аккуратная булавка с кипой, далеко — маленькая точка
// (чтобы не загромождать карту). Загрузчик/иконки — в ./yandex-loader; без ключа
// показываем заглушку, список остаётся доступен.

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { YANDEX_KEY, dotDataUri, loadYmaps, materialColor, pinDataUri, type YmapsMap } from "./yandex-loader";

type MapMode = "dot" | "pin" | "circle";

// ≥11 — круг 4 км; 7..10 — булавка; <7 (область/страна) — маленькая точка.
function modeForZoom(zoom: number): MapMode {
  if (zoom >= 11) return "circle";
  if (zoom >= 7) return "pin";
  return "dot";
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
  const modeRef = useRef<MapMode | null>(null);
  const drawRef = useRef<(fit: boolean) => void>(() => undefined);
  const observerRef = useRef<ResizeObserver | null>(null);
  const [failed, setFailed] = useState(false);

  const points = listings.filter((listing) => listing.circleLat != null && listing.circleLon != null);
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");

  // Пересоздаётся каждый рендер — замыкает актуальные points/onSelect; слушатель
  // boundschange (добавлен один раз) дёргает свежую версию через ref.
  drawRef.current = (fit: boolean) => {
    const ymaps = window.ymaps;
    const map = mapRef.current;
    if (!ymaps || !map) return;

    const mode = modeForZoom(map.getZoom());
    modeRef.current = mode;
    map.geoObjects.removeAll();

    const bounds: number[][] = [];
    for (const listing of points) {
      const center = [listing.circleLat as number, listing.circleLon as number];
      bounds.push(center);
      const color = materialColor(listing.positions[0]?.categorySlug);
      const hintContent = listing.positions.map((position) => position.nomenclatureName).join(", ");

      let object;
      if (mode === "circle") {
        object = new ymaps.Circle([center, MARKETPLACE_CIRCLE_RADIUS_KM * 1000], { hintContent }, {
          fillColor: `${color}2e`,
          strokeColor: color,
          strokeWidth: 2,
        });
      } else if (mode === "pin") {
        object = new ymaps.Placemark(
          center,
          { hintContent },
          { iconLayout: "default#image", iconImageHref: pinDataUri(color), iconImageSize: [30, 38], iconImageOffset: [-15, -38] },
        );
      } else {
        object = new ymaps.Placemark(
          center,
          { hintContent },
          { iconLayout: "default#image", iconImageHref: dotDataUri(color), iconImageSize: [14, 14], iconImageOffset: [-7, -7] },
        );
      }

      if (onSelect) {
        object.events.add("click", () => onSelect(listing.id));
      }
      map.geoObjects.add(object);
    }

    if (fit && bounds.length > 0) {
      try {
        map.setBounds(ymaps.util.bounds.fromPoints(bounds), { checkZoomRange: true, zoomMargin: 48 });
      } catch {
        // setBounds может бросить на единственной точке — оставляем вид как есть.
      }
    }
  };

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
            // Свап точка↔булавка↔круг при пересечении порогов зума.
            mapRef.current.events.add("boundschange", () => {
              const map = mapRef.current;
              if (!map) return;
              if (modeForZoom(map.getZoom()) !== modeRef.current) drawRef.current(false);
            });
            // Контейнер расширяется при сворачивании сайдбара — канвас карты сам
            // не реагирует, поэтому пересчитываем его под новый размер.
            observerRef.current = new ResizeObserver(() => mapRef.current?.container.fitToViewport());
            observerRef.current.observe(containerRef.current);
          }
          drawRef.current(true);
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

  // Очистка ресурсов при размонтировании.
  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
  }, []);

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
