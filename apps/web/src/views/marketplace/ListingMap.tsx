"use client";

// Карта ленты площадки на MapLibre GL (OSM). Цвет элемента — по сырью
// (макулатура/плёнки/полимеры). Два масштаба для читаемости: близко — круг 4 км
// (GeoJSON-полигон через fill/line, реальная точка скрыта), дальше — маленькая
// точка (circle-слой; пульс у свежих объявлений через rAF, hover — feature-state).
// Подложка — векторные тайлы, ОБРЕЗАННЫЕ по зоне Экоплатформы (РФ+новые
// территории+РБ) ещё при генерации, поэтому вне зоны данных нет и госграницы не
// рисуются вовсе. Базовый стиль векторный из NEXT_PUBLIC_MAP_STYLE_URL (self-host
// в проде); dev-fallback — OpenFreeMap positron. MapLibre ждёт координаты
// [lon, lat] — в БД храним circleLat/circleLon, разворачиваем при сборке.

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type GeoJSONSource, type Map as MlMap, type PropertyValueSpecification } from "maplibre-gl";
import { Protocol as PmtilesProtocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { isFreshListing } from "./listing-card-meta";
import { materialColor } from "./materials";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_DEFAULT_CENTER,
  LISTING_MAP_DEFAULT_ZOOM,
  circlePolygon,
  getSinglePointFocusView,
} from "./listing-map-view";

// Идентификаторы источников/слоёв MapLibre.
const SRC_POINTS = "listing-points";
const SRC_CIRCLES = "listing-circles";
const LYR_DOT = "listing-dot";
const LYR_DOT_PULSE = "listing-dot-pulse";
const LYR_CIRCLE_FILL = "listing-circle-fill";
const LYR_CIRCLE_LINE = "listing-circle-line";
const HOVER_LAYERS = [LYR_DOT, LYR_CIRCLE_FILL];
const LAYER_FADE_ZOOM_RANGE = 0.45;
const BASEMAP_LAYER_FADE_ZOOM_RANGE = 0.9;
const BASEMAP_LAYER_FADE_MIN_ZOOM = 4;
const MAX_MAP_ZOOM = 24;
const CIRCLE_FADE_START_ZOOM = LISTING_MAP_CIRCLE_ZOOM_THRESHOLD - LAYER_FADE_ZOOM_RANGE;
const CIRCLE_FADE_END_ZOOM = LISTING_MAP_CIRCLE_ZOOM_THRESHOLD + LAYER_FADE_ZOOM_RANGE;

const BASEMAP_OPACITY_PROPERTIES_BY_TYPE: Record<string, readonly string[]> = {
  circle: ["circle-opacity", "circle-stroke-opacity"],
  fill: ["fill-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  heatmap: ["heatmap-opacity"],
  line: ["line-opacity"],
  raster: ["raster-opacity"],
  symbol: ["text-opacity", "icon-opacity"],
};

// Тайлы подложки обрезаны по зоне Экоплатформы (РФ+новые территории+РБ) ещё на
// этапе генерации, поэтому вне зоны данных нет вовсе — и НЕ рисуем ни линий
// госграниц, ни заливки-маски (чище и без территориальных акцентов).
const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

// Базовый стиль карты: ВЕКТОРНЫЙ (OpenMapTiles-схема) — обязателен, чтобы (1)
// принудительно ставить русские подписи и (2) скрывать пограничные линии
// подложки (международный вид). positron — светлый минималистичный стиль (как
// просил владелец: светло-серый, выделены дороги, видны названия). В проде —
// self-host через NEXT_PUBLIC_MAP_STYLE_URL; dev-fallback — OpenFreeMap
// (бесплатный, без ключа, самохостится позже).
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const MAP_STYLE_URL = process.env.NEXT_PUBLIC_MAP_STYLE_URL || OPENFREEMAP_STYLE;

// pmtiles-протокол нужен для self-host тайлов в проде (стиль ссылается на
// pmtiles://). Регистрируем один раз; в dev (OpenFreeMap http) не используется.
let pmtilesRegistered = false;
function ensurePmtilesProtocol() {
  if (pmtilesRegistered) return;
  maplibregl.addProtocol("pmtiles", new PmtilesProtocol().tile);
  pmtilesRegistered = true;
}

// Точечные русские названия для мест новых территорий, где в тайлах OpenFreeMap
// нет name:ru (пробел данных провайдера; у большинства — Донецк/Луганск/Мариуполь/
// Симферополь/Ялта и т.д. — name:ru есть). Полное покрытие придёт с self-host
// тайлов (Фаза 5: name:ru гарантируется при сборке/дополняется из РФ-справочника).
const RU_NAME_OVERRIDES: Record<string, string> = {
  Запоріжжя: "Запорожье",
  Оріхів: "Орехов",
  Комишуваха: "Камышеваха",
  Надіївка: "Надеевка",
  Червоногригорівка: "Червоногригоровка",
};

// Подписи: name:ru → точечный РФ-словарь по name → исходное name. Для РФ-зоны
// нельзя уходить в name_int/name:en: эти поля часто дают латиницу или
// транслитерацию даже там, где основное name уже русское.
const LABEL_TEXT_FIELD = [
  "coalesce",
  ["get", "name:ru"],
  ["match", ["get", "name"], ...Object.entries(RU_NAME_OVERRIDES).flat(), ["get", "name"]],
];

const DOT_ZOOM_OPACITY: PropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  CIRCLE_FADE_START_ZOOM,
  1,
  CIRCLE_FADE_END_ZOOM,
  0,
];

const PULSE_ZOOM_OPACITY: PropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  CIRCLE_FADE_START_ZOOM,
  0.3,
  CIRCLE_FADE_END_ZOOM,
  0,
];

const CIRCLE_LINE_ZOOM_OPACITY: PropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  CIRCLE_FADE_START_ZOOM,
  0,
  CIRCLE_FADE_END_ZOOM,
  1,
];

const CIRCLE_FILL_ZOOM_OPACITY: PropertyValueSpecification<number> = [
  "interpolate",
  ["linear"],
  ["zoom"],
  CIRCLE_FADE_START_ZOOM,
  0,
  CIRCLE_FADE_END_ZOOM,
  ["case", ["boolean", ["feature-state", "hover"], false], 0.34, 0.18],
];

type BasemapLayerSpec = {
  id: string;
  type: string;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
  minzoom?: number;
  maxzoom?: number;
  "source-layer"?: string;
};

function dotFadeForZoom(zoom: number) {
  if (zoom <= CIRCLE_FADE_START_ZOOM) return 1;
  if (zoom >= CIRCLE_FADE_END_ZOOM) return 0;
  return (CIRCLE_FADE_END_ZOOM - zoom) / (CIRCLE_FADE_END_ZOOM - CIRCLE_FADE_START_ZOOM);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampOpacity(value: number) {
  return Math.min(1, Math.max(0, value));
}

function opacityFadeExpression(
  layer: BasemapLayerSpec,
  targetOpacity: number,
): PropertyValueSpecification<number> | null {
  const minZoom = finiteNumber(layer.minzoom);
  const maxZoom = finiteNumber(layer.maxzoom);
  const shouldFadeIn = minZoom != null && minZoom >= BASEMAP_LAYER_FADE_MIN_ZOOM;
  const shouldFadeOut = maxZoom != null && maxZoom < MAX_MAP_ZOOM - BASEMAP_LAYER_FADE_ZOOM_RANGE;

  if (!shouldFadeIn && !shouldFadeOut) return null;

  const stops: number[] = [];
  const pushStop = (zoom: number, opacity: number) => {
    const nextZoom = Math.min(MAX_MAP_ZOOM, Math.max(0, Number(zoom.toFixed(2))));
    const previousZoom = stops.length >= 2 ? stops[stops.length - 2] : null;
    if (previousZoom != null && nextZoom <= previousZoom) return false;
    stops.push(nextZoom, clampOpacity(opacity));
    return true;
  };

  if (shouldFadeIn && minZoom != null) {
    pushStop(minZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE, 0);
    pushStop(minZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE, targetOpacity);
  } else {
    pushStop(0, targetOpacity);
  }

  if (shouldFadeOut && maxZoom != null) {
    const fadeOutStart = maxZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE;
    const previousZoom = stops.length >= 2 ? (stops[stops.length - 2] ?? 0) : 0;
    const visibleUntilZoom = fadeOutStart > previousZoom ? fadeOutStart : Math.min(maxZoom, previousZoom + 0.01);
    pushStop(visibleUntilZoom, targetOpacity);
    pushStop(maxZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE, 0);
  }

  return ["interpolate", ["linear"], ["zoom"], ...stops] as PropertyValueSpecification<number>;
}

function applySmoothBasemapZoom(map: MlMap, layer: BasemapLayerSpec) {
  const opacityProperties = BASEMAP_OPACITY_PROPERTIES_BY_TYPE[layer.type];
  if (!opacityProperties) return;

  let didSetOpacity = false;
  for (const property of opacityProperties) {
    const currentValue = map.getPaintProperty(layer.id, property) ?? layer.paint?.[property];
    if (currentValue != null && finiteNumber(currentValue) == null) continue;

    const targetOpacity = finiteNumber(currentValue) ?? 1;
    const expression = opacityFadeExpression(layer, targetOpacity);
    if (!expression) continue;

    map.setPaintProperty(layer.id, property, expression);
    didSetOpacity = true;
  }

  if (!didSetOpacity) return;

  const minZoom = finiteNumber(layer.minzoom);
  const maxZoom = finiteNumber(layer.maxzoom);
  const nextMinZoom =
    minZoom != null && minZoom >= BASEMAP_LAYER_FADE_MIN_ZOOM
      ? Math.max(0, minZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE)
      : (minZoom ?? 0);
  const nextMaxZoom =
    maxZoom != null && maxZoom < MAX_MAP_ZOOM - BASEMAP_LAYER_FADE_ZOOM_RANGE
      ? Math.min(MAX_MAP_ZOOM, maxZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE)
      : (maxZoom ?? MAX_MAP_ZOOM);

  map.setLayerZoomRange(layer.id, nextMinZoom, nextMaxZoom);
}

// Приводим подложку к требованиям РФ: подписи — на русском, пограничные линии
// подложки скрываем (рисуем собственную зону). Работает для любого
// OpenMapTiles-совместимого стиля.
function applyRussianRfBasemap(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const spec = layer as BasemapLayerSpec;
    try {
      if (spec["source-layer"] === "boundary") {
        map.setLayoutProperty(spec.id, "visibility", "none");
        continue;
      }
      applySmoothBasemapZoom(map, spec);
      // text-field может лежать в layout слоя ИЛИ быть применён через стиль —
      // надёжнее спросить у карты текущее значение.
      const textField = map.getLayoutProperty(spec.id, "text-field") ?? spec.layout?.["text-field"];
      if (spec.type === "symbol" && textField && JSON.stringify(textField).includes("name")) {
        map.setLayoutProperty(spec.id, "text-field", LABEL_TEXT_FIELD);
      }
    } catch {
      // отдельный проблемный слой не должен прерывать локализацию остальных
    }
  }
}

// Видимая область карты в географических координатах (контракт «Искать в области»
// и серверного bbox-фильтра не зависит от провайдера).
export type MapViewBounds = { south: number; west: number; north: number; east: number };

export type ListingMapProps = {
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
};

type PointProps = { id: string; color: string; fresh: boolean };

function listingPoints(listings: MarketplaceListingListItem[]): MarketplaceListingListItem[] {
  return listings.filter((listing) => listing.circleLat != null && listing.circleLon != null);
}

function pointsCollection(points: MarketplaceListingListItem[]): FeatureCollection<Point, PointProps> {
  return {
    type: "FeatureCollection",
    features: points.map(
      (listing): Feature<Point, PointProps> => ({
        type: "Feature",
        id: listing.id,
        geometry: { type: "Point", coordinates: [listing.circleLon as number, listing.circleLat as number] },
        properties: {
          id: listing.id,
          color: materialColor(listing.positions[0]?.categorySlug),
          fresh: isFreshListing(listing.publishedAt),
        },
      }),
    ),
  };
}

function circlesCollection(
  points: MarketplaceListingListItem[],
): FeatureCollection<Polygon, { id: string; color: string }> {
  return {
    type: "FeatureCollection",
    features: points.map(
      (listing): Feature<Polygon, { id: string; color: string }> => ({
        type: "Feature",
        id: listing.id,
        geometry: {
          type: "Polygon",
          coordinates: circlePolygon(
            [listing.circleLon as number, listing.circleLat as number],
            MARKETPLACE_CIRCLE_RADIUS_KM,
          ),
        },
        properties: { id: listing.id, color: materialColor(listing.positions[0]?.categorySlug) },
      }),
    ),
  };
}

export function ListingMap({
  listings,
  onSelect,
  hoveredId,
  onHover,
  onUserMoved,
  fitOnDataChange = true,
}: ListingMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
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

  const points = listingPoints(listings);
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");

  // Подсветка объекта — через feature-state hover на обоих источниках (точка и
  // круг живут в разных source, активен лишь один по зуму, но состояние держим в
  // обоих, чтобы переживать свап масштаба).
  function setHover(id: string | null, on: boolean) {
    const map = mapRef.current;
    if (!map || !id || !readyRef.current) return;
    for (const source of [SRC_POINTS, SRC_CIRCLES]) {
      if (map.getSource(source)) map.setFeatureState({ source, id }, { hover: on });
    }
  }

  function emitBoundsIfUserMoved() {
    const map = mapRef.current;
    if (!map) return;
    if (Date.now() < suppressMovedUntilRef.current || !onUserMovedRef.current) return;
    const b = map.getBounds();
    onUserMovedRef.current({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  }

  // Установка/обновление данных и подгонка вида. Вызывается на load и при смене
  // набора точек.
  function applyData(fit: boolean) {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;

    (map.getSource(SRC_POINTS) as GeoJSONSource | undefined)?.setData(pointsCollection(points));
    (map.getSource(SRC_CIRCLES) as GeoJSONSource | undefined)?.setData(circlesCollection(points));

    if (!fit || points.length === 0) return;

    const focus = getSinglePointFocusView(points);
    suppressMovedUntilRef.current = Date.now() + 700;
    if (focus) {
      map.jumpTo({ center: focus.center, zoom: focus.zoom });
      return;
    }
    let west = Infinity;
    let south = Infinity;
    let east = -Infinity;
    let north = -Infinity;
    for (const listing of points) {
      const lon = listing.circleLon as number;
      const lat = listing.circleLat as number;
      west = Math.min(west, lon);
      east = Math.max(east, lon);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: FIT_PADDING, animate: false },
    );
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    ensurePmtilesProtocol();
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: MAP_STYLE_URL,
        center: LISTING_MAP_DEFAULT_CENTER,
        zoom: LISTING_MAP_DEFAULT_ZOOM,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    let pulseFrame = 0;
    map.on("error", () => undefined); // тайловые ошибки не должны валить компонент

    // Настройку вешаем на styledata, а НЕ на load: с обрезанными по зоне тайлами
    // часть вьюпорта пустая, из-за чего map.loaded() навсегда false и событие
    // load не наступает. styledata срабатывает после парса стиля (слои уже можно
    // добавлять). readyRef гарантирует однократный прогон.
    const setupMap = () => {
      if (readyRef.current || !mapRef.current) return;
      if (map.getSource(SRC_POINTS)) return;
      // Подложку — к виду РФ: русские подписи + скрытые пограничные линии.
      applyRussianRfBasemap(map);

      map.addSource(SRC_POINTS, { type: "geojson", data: pointsCollection(points) });
      map.addSource(SRC_CIRCLES, { type: "geojson", data: circlesCollection(points) });

      // Круг 4 км — на городском масштабе и ближе.
      map.addLayer({
        id: LYR_CIRCLE_FILL,
        type: "fill",
        source: SRC_CIRCLES,
        minzoom: CIRCLE_FADE_START_ZOOM,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": CIRCLE_FILL_ZOOM_OPACITY,
        },
      });
      map.addLayer({
        id: LYR_CIRCLE_LINE,
        type: "line",
        source: SRC_CIRCLES,
        minzoom: CIRCLE_FADE_START_ZOOM,
        paint: {
          "line-color": ["get", "color"],
          "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 3, 2],
          "line-opacity": CIRCLE_LINE_ZOOM_OPACITY,
        },
      });

      // Пульс свежих объявлений (под точкой) — анимируется rAF ниже.
      map.addLayer({
        id: LYR_DOT_PULSE,
        type: "circle",
        source: SRC_POINTS,
        maxzoom: CIRCLE_FADE_END_ZOOM,
        filter: ["==", ["get", "fresh"], true],
        paint: { "circle-color": ["get", "color"], "circle-opacity": PULSE_ZOOM_OPACITY, "circle-radius": 6 },
      });
      // Точка дальнего масштаба.
      map.addLayer({
        id: LYR_DOT,
        type: "circle",
        source: SRC_POINTS,
        maxzoom: CIRCLE_FADE_END_ZOOM,
        paint: {
          "circle-color": ["get", "color"],
          "circle-radius": ["case", ["boolean", ["feature-state", "hover"], false], 8, 6],
          "circle-opacity": DOT_ZOOM_OPACITY,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": DOT_ZOOM_OPACITY,
        },
      });

      readyRef.current = true;
      applyData(fitOnDataChangeRef.current);

      // Hover/курсор/клик на интерактивных слоях.
      for (const layer of HOVER_LAYERS) {
        map.on("mousemove", layer, (event) => {
          map.getCanvas().style.cursor = "pointer";
          const id = event.features?.[0]?.id;
          if (id == null) return;
          const next = String(id);
          if (hoveredIdRef.current === next) return;
          if (hoveredIdRef.current) setHover(hoveredIdRef.current, false);
          hoveredIdRef.current = next;
          setHover(next, true);
          onHoverRef.current?.(next);
        });
        map.on("mouseleave", layer, () => {
          map.getCanvas().style.cursor = "";
          if (hoveredIdRef.current) setHover(hoveredIdRef.current, false);
          hoveredIdRef.current = null;
          onHoverRef.current?.(null);
        });
        map.on("click", layer, (event) => {
          const id = event.features?.[0]?.id;
          if (id != null) onSelectRef.current?.(String(id));
        });
      }

      // Пульсация свежих точек: синус по радиусу/прозрачности. Уважаем
      // prefers-reduced-motion — тогда пульс статичный, без анимации.
      const reducedMotion =
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reducedMotion) {
        const animate = () => {
          const phase = (Math.sin(Date.now() / 500) + 1) / 2; // 0..1
          if (map.getLayer(LYR_DOT_PULSE)) {
            map.setPaintProperty(LYR_DOT_PULSE, "circle-radius", 6 + phase * 12);
            map.setPaintProperty(LYR_DOT_PULSE, "circle-opacity", 0.35 * (1 - phase) * dotFadeForZoom(map.getZoom()));
          }
          pulseFrame = requestAnimationFrame(animate);
        };
        pulseFrame = requestAnimationFrame(animate);
      }
    };

    // styledata надёжно срабатывает после загрузки стиля; load оставляем как
    // дополнительный путь (на полных тайлах он сработает раньше).
    map.on("styledata", setupMap);
    map.on("load", setupMap);
    if (map.isStyleLoaded()) setupMap();

    map.on("moveend", emitBoundsIfUserMoved);

    return () => {
      cancelAnimationFrame(pulseFrame);
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Обновление данных и вида при смене набора точек.
  useEffect(() => {
    applyData(fitOnDataChangeRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Подсветка объекта при hover карточки в ленте.
  useEffect(() => {
    const previous = hoveredIdRef.current;
    const next = hoveredId ?? null;
    if (previous && previous !== next) setHover(previous, false);
    if (next) setHover(next, true);
    hoveredIdRef.current = next;
  }, [hoveredId]);

  if (failed) {
    return <div className="mp-map-placeholder">Карта временно недоступна. Объявления показаны списком ниже.</div>;
  }

  return <div ref={containerRef} className="mp-map" role="region" aria-label="Карта объявлений" />;
}
