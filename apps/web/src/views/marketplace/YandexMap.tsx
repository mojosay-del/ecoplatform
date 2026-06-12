"use client";

// Виджет Яндекс.Карт для ленты площадки. Цвет элемента — по сырью (макулатура/
// плёнки/полимеры). Два масштаба для читаемости: близко — круг 4 км (реальная
// точка скрыта), дальше — маленькая точка
// (чтобы не загромождать карту). Загрузчик/иконки — в ./yandex-loader; без ключа
// показываем заглушку, список остаётся доступен.

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { isFreshListing } from "./listing-card-meta";
import { materialColor } from "./materials";
import { YANDEX_KEY, dotDataUri, loadYmaps, pulseDotDataUri, type YmapsGeoObject, type YmapsMap } from "./yandex-loader";
import {
  type ListingMapMode,
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_DEFAULT_CENTER,
  LISTING_MAP_DEFAULT_ZOOM,
  circleStyleOptions,
  dotIconOptions,
  getSinglePointFocusView,
  pulseDotIconOptions,
  shouldClusterMapPoints,
} from "./yandex-map-view";

// Начиная с городского масштаба показываем круг 4 км; дальше — маленькая точка.
function modeForZoom(zoom: number): ListingMapMode {
  if (zoom >= LISTING_MAP_CIRCLE_ZOOM_THRESHOLD) return "circle";
  return "dot";
}

// Запись реестра объектов карты — для смены стиля при hover без перерисовки.
type MapObjectEntry = { object: YmapsGeoObject; color: string; mode: ListingMapMode; pulse: boolean };

function applyObjectStyle(entry: MapObjectEntry, highlighted: boolean) {
  if (entry.mode === "circle") {
    entry.object.options.set(circleStyleOptions(entry.color, highlighted));
  } else if (highlighted) {
    entry.object.options.set(dotIconOptions(dotDataUri(entry.color, true), true));
  } else if (entry.pulse) {
    // Свежая точка после снятия hover возвращается к пульсации.
    entry.object.options.set(pulseDotIconOptions(pulseDotDataUri(entry.color)));
  } else {
    entry.object.options.set(dotIconOptions(dotDataUri(entry.color), false));
  }
}

// Видимая область карты в географических координатах.
export type MapViewBounds = { south: number; west: number; north: number; east: number };

export function YandexMap({
  listings,
  onSelect,
  hoveredId,
  onHover,
  onUserMoved,
  fitOnDataChange = true,
}: {
  listings: MarketplaceListingListItem[];
  onSelect?: (id: string) => void;
  // Двусторонняя hover-синхронизация с лентой: подсветить объект по id…
  hoveredId?: string | null;
  // …и сообщить об наведении на объект карты (null — увели курсор).
  onHover?: (id: string | null) => void;
  // Ручное перемещение/зум карты (программные fit не считаются) — отдаёт
  // текущие границы для кнопки «Искать в этой области».
  onUserMoved?: (bounds: MapViewBounds) => void;
  // При активном bbox-фильтре карту не пере-fit'им под новые данные, чтобы не
  // сбивать выставленный пользователем вид (и не зациклить fit → moved).
  fitOnDataChange?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YmapsMap | null>(null);
  const modeRef = useRef<ListingMapMode | null>(null);
  const drawRef = useRef<(fit: boolean) => void>(() => undefined);
  const observerRef = useRef<ResizeObserver | null>(null);
  const objectsRef = useRef<Map<string, MapObjectEntry>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);
  // Через ref, чтобы колбэки родителя не пересоздавали эффект карты.
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onUserMovedRef = useRef(onUserMoved);
  onUserMovedRef.current = onUserMoved;
  const fitOnDataChangeRef = useRef(fitOnDataChange);
  fitOnDataChangeRef.current = fitOnDataChange;
  // Окно подавления boundschange после программных setCenter/setBounds.
  const suppressMovedUntilRef = useRef(0);
  const movedTimerRef = useRef<number | undefined>(undefined);
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
        suppressMovedUntilRef.current = Date.now() + 600;
        map.setCenter(focusView.center, focusView.zoom, { checkZoomRange: true });
      } catch {
        // Если API карты не смог сменить вид, ниже останется текущий масштаб.
      }
    }

    const mode = modeForZoom(focusView?.zoom ?? map.getZoom());
    modeRef.current = mode;
    map.geoObjects.removeAll();
    objectsRef.current = new Map();

    const bounds: number[][] = [];
    const dotObjects: YmapsGeoObject[] = [];
    const useClusterer = shouldClusterMapPoints(mode, points.length);
    // Пульсация — только без prefers-reduced-motion (SMIL заменяем статикой).
    const reducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const listing of points) {
      const center = [listing.circleLat as number, listing.circleLon as number];
      bounds.push(center);
      const color = materialColor(listing.positions[0]?.categorySlug);
      const fresh = isFreshListing(listing.publishedAt);
      const hintContent =
        (fresh ? "Новое · " : "") + listing.positions.map((position) => position.nomenclatureName).join(", ");

      let object: YmapsGeoObject;
      const pulse = fresh && !reducedMotion && mode === "dot";
      if (mode === "circle") {
        object = new ymaps.Circle([center, MARKETPLACE_CIRCLE_RADIUS_KM * 1000], { hintContent }, circleStyleOptions(color, false));
      } else if (pulse) {
        object = new ymaps.Placemark(center, { hintContent }, pulseDotIconOptions(pulseDotDataUri(color)));
      } else {
        object = new ymaps.Placemark(center, { hintContent }, dotIconOptions(dotDataUri(color), false));
      }
      objectsRef.current.set(listing.id, { object, color, mode, pulse });

      if (onSelect) {
        object.events.add("click", () => onSelect(listing.id));
      }
      object.events.add("mouseenter", () => onHoverRef.current?.(listing.id));
      object.events.add("mouseleave", () => onHoverRef.current?.(null));
      if (useClusterer) {
        dotObjects.push(object);
      } else {
        map.geoObjects.add(object);
      }
    }

    // После перерисовки (свап режима по зуму) переприменяем активную подсветку.
    const hovered = hoveredIdRef.current;
    if (hovered) {
      const entry = objectsRef.current.get(hovered);
      if (entry) applyObjectStyle(entry, true);
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
        suppressMovedUntilRef.current = Date.now() + 600;
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
            // Свап точка↔круг при пересечении порога зума + детект ручного
            // перемещения (boundschange дребезжит — дебаунс 300 мс).
            mapRef.current.events.add("boundschange", () => {
              const map = mapRef.current;
              if (!map) return;
              if (modeForZoom(map.getZoom()) !== modeRef.current) drawRef.current(false);
              if (Date.now() < suppressMovedUntilRef.current || !onUserMovedRef.current) return;
              window.clearTimeout(movedTimerRef.current);
              movedTimerRef.current = window.setTimeout(() => {
                const current = mapRef.current;
                if (!current || !onUserMovedRef.current) return;
                const [sw, ne] = current.getBounds();
                if (sw?.[0] == null || sw[1] == null || ne?.[0] == null || ne[1] == null) return;
                onUserMovedRef.current({ south: sw[0], west: sw[1], north: ne[0], east: ne[1] });
              }, 300);
            });
            // Контейнер расширяется при сворачивании сайдбара — канвас карты сам
            // не реагирует, поэтому пересчитываем его под новый размер.
            observerRef.current = new ResizeObserver(() => mapRef.current?.container.fitToViewport());
            observerRef.current.observe(containerRef.current);
          }
          drawRef.current(fitOnDataChangeRef.current);
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

  // Подсветка объекта при hover карточки в ленте — стиль меняется через
  // options.set, без перерисовки карты.
  useEffect(() => {
    const previous = hoveredIdRef.current;
    const next = hoveredId ?? null;
    if (previous && previous !== next) {
      const entry = objectsRef.current.get(previous);
      if (entry) applyObjectStyle(entry, false);
    }
    if (next) {
      const entry = objectsRef.current.get(next);
      if (entry) applyObjectStyle(entry, true);
    }
    hoveredIdRef.current = next;
  }, [hoveredId]);

  // Очистка ресурсов при размонтировании.
  useEffect(() => {
    return () => {
      window.clearTimeout(movedTimerRef.current);
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
