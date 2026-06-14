"use client";

// Карта ленты площадки на 2ГИС MapGL. Цвет элемента — по сырью (макулатура/
// плёнки/полимеры). Два масштаба для читаемости: близко — круг 4 км (реальная
// точка скрыта), дальше — маленькая DOM-точка (HtmlMarker; CSS-пульс у свежих
// объявлений, hover — класс). Загрузчик/типы — в ./mapgl-loader; без ключа
// показываем заглушку, список остаётся доступен. MapGL ждёт координаты в порядке
// [lon, lat] — переворачиваем при передаче (в БД храним circleLat/circleLon).

import { useEffect, useRef, useState } from "react";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { isFreshListing } from "./listing-card-meta";
import { materialColor } from "./materials";
import {
  DGIS_MAPS_KEY,
  loadMapgl,
  type MapglCircle,
  type MapglHtmlMarker,
  type MapglLngLat,
  type MapglMap,
} from "./mapgl-loader";
import {
  type ListingMapMode,
  LISTING_MAP_DEFAULT_CENTER,
  LISTING_MAP_DEFAULT_ZOOM,
  circleStyleOptions,
  getSinglePointFocusView,
  modeForZoom,
} from "./listing-map-view";

// Точка-маркер: фикс-бокс 14px, заякорена в свой центр (пульс-кольцо свежего
// объявления рисуется ::after и выходит за бокс, не сдвигая якорь).
const DOT_SIZE = 14;
const DOT_ANCHOR: [number, number] = [DOT_SIZE / 2, DOT_SIZE / 2];
const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

// Видимая область карты в географических координатах (контракт «Искать в области»
// и серверного bbox-фильтра не зависит от провайдера).
export type MapViewBounds = { south: number; west: number; north: number; east: number };

// Запись реестра объектов карты — для hover-синхро ленты↔карты без полной
// перерисовки. У точки держим DOM-узел (toggle класса), у круга — параметры для
// пересоздания в подсвеченном стиле.
type MapObjectEntry =
  | { mode: "dot"; marker: MapglHtmlMarker; element: HTMLElement }
  | { mode: "circle"; circle: MapglCircle; color: string; coordinates: MapglLngLat };

export function ListingMap({
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
  // …и сообщить о наведении на объект карты (null — увели курсор).
  onHover?: (id: string | null) => void;
  // Ручное перемещение/зум карты (программные fit не считаются) — отдаёт
  // текущие границы для кнопки «Искать в этой области».
  onUserMoved?: (bounds: MapViewBounds) => void;
  // При активном bbox-фильтре карту не пере-fit'им под новые данные, чтобы не
  // сбивать выставленный пользователем вид (и не зациклить fit → moved).
  fitOnDataChange?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapglMap | null>(null);
  const modeRef = useRef<ListingMapMode | null>(null);
  const drawRef = useRef<(fit: boolean) => void>(() => undefined);
  const objectsRef = useRef<Map<string, MapObjectEntry>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);
  // Через ref, чтобы колбэки родителя не пересоздавали эффект карты.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onUserMovedRef = useRef(onUserMoved);
  onUserMovedRef.current = onUserMoved;
  const fitOnDataChangeRef = useRef(fitOnDataChange);
  fitOnDataChangeRef.current = fitOnDataChange;
  // Окно подавления moveend после программных setCenter/fitBounds.
  const suppressMovedUntilRef = useRef(0);
  const [failed, setFailed] = useState(false);

  const points = listings.filter((listing) => listing.circleLat != null && listing.circleLon != null);
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");

  // Создание круга 4 км с навешенными событиями. Используется и при отрисовке, и
  // при hover-подсветке (пересоздаём один задетый круг в плотном стиле).
  function createCircle(id: string, coordinates: MapglLngLat, color: string, highlighted: boolean): MapglCircle {
    const mapgl = window.mapgl;
    const map = mapRef.current;
    const circle = new mapgl!.Circle(map!, {
      coordinates,
      radius: MARKETPLACE_CIRCLE_RADIUS_KM * 1000,
      ...circleStyleOptions(color, highlighted),
    });
    circle.on("click", () => onSelectRef.current?.(id));
    circle.on("mouseover", () => onHoverRef.current?.(id));
    circle.on("mouseout", () => onHoverRef.current?.(null));
    return circle;
  }

  // Создание DOM-точки дальнего масштаба. Цвет — inline-переменной, пульс свежего
  // объявления и hover-подсветка — классами (стили в marketplace.css).
  function createDot(id: string, coordinates: MapglLngLat, color: string, fresh: boolean): MapObjectEntry {
    const mapgl = window.mapgl;
    const map = mapRef.current;
    const element = document.createElement("div");
    element.className = `mp-map-dot${fresh ? " is-fresh" : ""}`;
    element.style.setProperty("--dot", color);
    element.addEventListener("click", () => onSelectRef.current?.(id));
    element.addEventListener("mouseenter", () => onHoverRef.current?.(id));
    element.addEventListener("mouseleave", () => onHoverRef.current?.(null));
    const marker = new mapgl!.HtmlMarker(map!, {
      coordinates,
      html: element,
      anchor: DOT_ANCHOR,
      interactive: true,
    });
    return { mode: "dot", marker, element };
  }

  function clearObjects() {
    for (const entry of objectsRef.current.values()) {
      if (entry.mode === "circle") entry.circle.destroy();
      else entry.marker.destroy();
    }
    objectsRef.current = new Map();
  }

  // Пересоздаётся каждый рендер — замыкает актуальные points; слушатель moveend
  // (добавлен один раз) дёргает свежую версию через drawRef.
  drawRef.current = (fit: boolean) => {
    const map = mapRef.current;
    if (!window.mapgl || !map) return;

    const focusView = fit ? getSinglePointFocusView(points) : null;
    if (focusView) {
      suppressMovedUntilRef.current = Date.now() + 600;
      map.setCenter(focusView.center);
      map.setZoom(focusView.zoom);
    }

    const mode = modeForZoom(focusView?.zoom ?? map.getZoom());
    modeRef.current = mode;
    clearObjects();

    const lons: number[] = [];
    const lats: number[] = [];
    for (const listing of points) {
      const lon = listing.circleLon as number;
      const lat = listing.circleLat as number;
      lons.push(lon);
      lats.push(lat);
      const coordinates: MapglLngLat = [lon, lat];
      const color = materialColor(listing.positions[0]?.categorySlug);

      if (mode === "circle") {
        objectsRef.current.set(listing.id, {
          mode: "circle",
          circle: createCircle(listing.id, coordinates, color, false),
          color,
          coordinates,
        });
      } else {
        objectsRef.current.set(
          listing.id,
          createDot(listing.id, coordinates, color, isFreshListing(listing.publishedAt)),
        );
      }
    }

    // После перерисовки (свап режима по зуму) переприменяем активную подсветку.
    const hovered = hoveredIdRef.current;
    if (hovered) setObjectHover(hovered, true);

    if (fit && points.length > 1) {
      suppressMovedUntilRef.current = Date.now() + 600;
      map.fitBounds(
        {
          southWest: [Math.min(...lons), Math.min(...lats)],
          northEast: [Math.max(...lons), Math.max(...lats)],
        },
        { padding: FIT_PADDING },
      );
    }
  };

  // Подсветка/снятие подсветки одного объекта: точка — класс на DOM-узле, круг —
  // пересоздание в плотном стиле (обновляем запись реестра).
  function setObjectHover(id: string, highlighted: boolean) {
    const entry = objectsRef.current.get(id);
    if (!entry) return;
    if (entry.mode === "dot") {
      entry.element.classList.toggle("is-hovered", highlighted);
      return;
    }
    entry.circle.destroy();
    objectsRef.current.set(id, {
      ...entry,
      circle: createCircle(id, entry.coordinates, entry.color, highlighted),
    });
  }

  useEffect(() => {
    if (!DGIS_MAPS_KEY) {
      setFailed(true);
      return;
    }
    let cancelled = false;

    loadMapgl()
      .then(() => {
        const mapgl = window.mapgl;
        if (cancelled || !mapgl || !containerRef.current) return;
        if (!mapRef.current) {
          const focusView = getSinglePointFocusView(points);
          mapRef.current = new mapgl.Map(containerRef.current, {
            key: DGIS_MAPS_KEY,
            center: focusView?.center ?? LISTING_MAP_DEFAULT_CENTER,
            zoom: focusView?.zoom ?? LISTING_MAP_DEFAULT_ZOOM,
            // Сам следит за размером контейнера: при сворачивании сайдбара
            // грид-колонка расширяется — карта пересчитывается без ResizeObserver.
            enableTrackResize: true,
            zoomControl: "centerRight",
          });
          // moveend терминален (срабатывает в конце жеста) — отдельный дебаунс не
          // нужен. Свап точка↔круг при пересечении порога зума + детект ручного
          // перемещения для «Искать в этой области» (вне окна подавления fit).
          mapRef.current.on("moveend", () => {
            const map = mapRef.current;
            if (!map) return;
            if (modeForZoom(map.getZoom()) !== modeRef.current) drawRef.current(false);
            if (Date.now() < suppressMovedUntilRef.current || !onUserMovedRef.current) return;
            const { southWest, northEast } = map.getBounds();
            onUserMovedRef.current({
              south: southWest[1],
              west: southWest[0],
              north: northEast[1],
              east: northEast[0],
            });
          });
        }
        drawRef.current(fitOnDataChangeRef.current);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Подсветка объекта при hover карточки в ленте.
  useEffect(() => {
    const previous = hoveredIdRef.current;
    const next = hoveredId ?? null;
    if (previous && previous !== next) setObjectHover(previous, false);
    if (next) setObjectHover(next, true);
    hoveredIdRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredId]);

  // Очистка ресурсов при размонтировании.
  useEffect(() => {
    return () => {
      clearObjects();
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed || !DGIS_MAPS_KEY) {
    return (
      <div className="mp-map-placeholder">
        Карта временно недоступна{DGIS_MAPS_KEY ? " (ошибка загрузки 2ГИС)" : " — не задан ключ карт 2ГИС"}. Объявления
        показаны списком ниже.
      </div>
    );
  }

  return <div ref={containerRef} className="mp-map" />;
}
