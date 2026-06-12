"use client";

// Виджет Яндекс.Карт для ленты площадки. Цвет элемента — по сырью (макулатура/
// плёнки/полимеры). Два масштаба для читаемости: близко — круг 4 км (реальная
// точка скрыта), дальше — маленькая точка
// (чтобы не загромождать карту). Загрузчик/иконки — в ./yandex-loader; без ключа
// показываем заглушку, список остаётся доступен.

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { materialColor } from "./materials";
import { YANDEX_KEY, dotDataUri, loadYmaps, type YmapsGeoObject, type YmapsMap } from "./yandex-loader";
import {
  type ListingMapMode,
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_DEFAULT_CENTER,
  LISTING_MAP_DEFAULT_ZOOM,
  getSinglePointFocusView,
  shouldClusterMapPoints,
} from "./yandex-map-view";

// Начиная с городского масштаба показываем круг 4 км; дальше — маленькая точка.
function modeForZoom(zoom: number): ListingMapMode {
  if (zoom >= LISTING_MAP_CIRCLE_ZOOM_THRESHOLD) return "circle";
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
  const modeRef = useRef<ListingMapMode | null>(null);
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

    const focusView = fit ? getSinglePointFocusView(points) : null;
    if (focusView) {
      try {
        map.setCenter(focusView.center, focusView.zoom, { checkZoomRange: true });
      } catch {
        // Если API карты не смог сменить вид, ниже останется текущий масштаб.
      }
    }

    const mode = modeForZoom(focusView?.zoom ?? map.getZoom());
    modeRef.current = mode;
    map.geoObjects.removeAll();

    const bounds: number[][] = [];
    const dotObjects: YmapsGeoObject[] = [];
    const useClusterer = shouldClusterMapPoints(mode, points.length);
    for (const listing of points) {
      const center = [listing.circleLat as number, listing.circleLon as number];
      bounds.push(center);
      const color = materialColor(listing.positions[0]?.categorySlug);
      const hintContent = listing.positions.map((position) => position.nomenclatureName).join(", ");

      let object: YmapsGeoObject;
      if (mode === "circle") {
        object = new ymaps.Circle(
          [center, MARKETPLACE_CIRCLE_RADIUS_KM * 1000],
          { hintContent },
          {
            fillColor: `${color}2e`,
            strokeColor: color,
            strokeWidth: 2,
          },
        );
      } else {
        object = new ymaps.Placemark(
          center,
          { hintContent },
          {
            iconLayout: "default#image",
            iconImageHref: dotDataUri(color),
            iconImageSize: [14, 14],
            iconImageOffset: [-7, -7],
          },
        );
      }

      if (onSelect) {
        object.events.add("click", () => onSelect(listing.id));
      }
      if (useClusterer) {
        dotObjects.push(object);
      } else {
        map.geoObjects.add(object);
      }
    }

    if (dotObjects.length > 0) {
      const clusterer = new ymaps.Clusterer({
        hasBalloon: false,
        hasHint: true,
        gridSize: 64,
        minClusterSize: 2,
        viewportMargin: 64,
        zoomMargin: 48,
      });
      clusterer.add(dotObjects);
      map.geoObjects.add(clusterer);
    }

    if (fit && bounds.length > 1) {
      try {
        map.setBounds(ymaps.util.bounds.fromPoints(bounds), { checkZoomRange: true, zoomMargin: 48 });
      } catch {
        // setBounds может бросить при невалидной геометрии — оставляем вид как есть.
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
            const focusView = getSinglePointFocusView(points);
            mapRef.current = new ymaps.Map(containerRef.current, {
              center: focusView?.center ?? LISTING_MAP_DEFAULT_CENTER,
              zoom: focusView?.zoom ?? LISTING_MAP_DEFAULT_ZOOM,
              controls: ["zoomControl"],
            });
            // Свап точка↔круг при пересечении порога зума.
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
