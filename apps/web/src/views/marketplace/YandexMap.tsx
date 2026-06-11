"use client";

// Виджет Яндекс.Карт для ленты площадки. Круги 4 км по отображаемым центрам
// объявлений (реальная точка скрыта), цвет — по сырью (макулатура/плёнки/
// полимеры). На сильном отдалении круг превращается в булавку с иконкой кипы
// того же цвета — так точки лучше видно издалека. Ключ/загрузчик — в
// ./yandex-loader; без ключа показываем заглушку, список остаётся доступен.

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { YANDEX_KEY, balecasePinDataUri, loadYmaps, materialColor, type YmapsMap } from "./yandex-loader";

// Зум < порога → булавки (круг 4 км на мелком масштабе почти не виден); иначе круги.
const PIN_ZOOM_THRESHOLD = 10;

export function YandexMap({
  listings,
  onSelect,
}: {
  listings: MarketplaceListingListItem[];
  onSelect?: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YmapsMap | null>(null);
  const modeRef = useRef<"pin" | "circle" | null>(null);
  const drawRef = useRef<(fit: boolean) => void>(() => undefined);
  const [failed, setFailed] = useState(false);

  const points = listings.filter((listing) => listing.circleLat != null && listing.circleLon != null);
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");

  // Реализация отрисовки пересоздаётся каждый рендер — замыкает актуальные
  // points/onSelect, поэтому слушатель boundschange (добавлен один раз) всегда
  // дёргает свежую версию через ref.
  drawRef.current = (fit: boolean) => {
    const ymaps = window.ymaps;
    const map = mapRef.current;
    if (!ymaps || !map) return;

    const mode: "pin" | "circle" = map.getZoom() < PIN_ZOOM_THRESHOLD ? "pin" : "circle";
    modeRef.current = mode;
    map.geoObjects.removeAll();

    const bounds: number[][] = [];
    for (const listing of points) {
      const center = [listing.circleLat as number, listing.circleLon as number];
      bounds.push(center);
      const color = materialColor(listing.positions[0]?.categorySlug);
      const hintContent = listing.positions.map((position) => position.nomenclatureName).join(", ");

      const object =
        mode === "pin"
          ? new ymaps.Placemark(
              center,
              { hintContent },
              {
                iconLayout: "default#image",
                iconImageHref: balecasePinDataUri(color),
                iconImageSize: [32, 42],
                iconImageOffset: [-16, -42],
              },
            )
          : new ymaps.Circle([center, MARKETPLACE_CIRCLE_RADIUS_KM * 1000], { hintContent }, {
              fillColor: `${color}2e`,
              strokeColor: color,
              strokeWidth: 2,
            });

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
            // Свап булавка↔круг при пересечении порога зума.
            mapRef.current.events.add("boundschange", () => {
              const map = mapRef.current;
              if (!map) return;
              const mode = map.getZoom() < PIN_ZOOM_THRESHOLD ? "pin" : "circle";
              if (mode !== modeRef.current) drawRef.current(false);
            });
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
