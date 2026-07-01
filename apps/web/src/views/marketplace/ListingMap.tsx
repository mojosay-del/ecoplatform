"use client";

// Карта ленты площадки на MapLibre GL (OSM). Цвет элемента — по сырью
// (макулатура/плёнки/полимеры). Два масштаба для читаемости: близко — круг
// приватности 500 м (GeoJSON-полигон через fill/line, реальная точка скрыта),
// дальше — пин/точка (пульс у свежих объявлений, hover — feature-state).
// Подложка — векторные тайлы, ОБРЕЗАННЫЕ по зоне Экоплатформы (РФ+новые
// территории+РБ) ещё при генерации, поэтому вне зоны данных нет и госграницы не
// рисуются вовсе. Базовый стиль векторный из NEXT_PUBLIC_MAP_STYLE_URL (self-host
// в проде); dev-fallback — OpenFreeMap positron. MapLibre ждёт координаты
// [lon, lat] — в БД храним circleLat/circleLon, разворачиваем при сборке.

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, {
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MlMap,
  type PropertyValueSpecification,
} from "maplibre-gl";
import { Protocol as PmtilesProtocol } from "pmtiles";
import Supercluster from "supercluster";
import { useEffect, useRef, useState } from "react";
import { Box, Compass, Minus, Plus, RotateCcw, RotateCw } from "lucide-react";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import type { MarketplaceListingListItem } from "@ecoplatform/shared";
import { MARKETPLACE_CIRCLE_RADIUS_KM } from "@ecoplatform/shared";
import { isFreshListing } from "./listing-card-meta";
import { MATERIAL_COLORS, materialColor } from "./materials";
import {
  LISTING_MAP_CIRCLE_ZOOM_THRESHOLD,
  LISTING_MAP_DEFAULT_CENTER,
  LISTING_MAP_DEFAULT_ZOOM,
  LISTING_MAP_MIN_ZOOM,
  circlePolygon,
  getSinglePointFocusView,
  shouldHideBasemapLayer,
} from "./listing-map-view";
import {
  LABEL_TEXT_FIELD,
  RF_AND_BELARUS_LABEL_ZONE,
  shouldConstrainLabelLayerToPlatformZone,
} from "./listing-map-label-zones";
import {
  BASEMAP_LAYOUT_OVERRIDES_BY_ID,
  BASEMAP_OPACITY_PROPERTIES_BY_TYPE,
  BASEMAP_PAINT_OVERRIDES_BY_ID,
  BASEMAP_REVEAL_WINDOWS,
  basemapPaletteOverrides,
  isBasemapTerrainLayer,
} from "./listing-map-basemap-style";

// Пины и donut-кластеры — HTML-маркеры (maplibregl.Marker), кластеризацию считаем
// на клиенте через supercluster (надёжнее, чем querySourceFeatures на обрезанных
// по зоне тайлах). Круг приватности 500 м — fill/line-слои MapLibre на отдельном
// источнике.
const SRC_CIRCLES = "listing-circles";
const LYR_CIRCLE_FILL = "listing-circle-fill";
const LYR_CIRCLE_LINE = "listing-circle-line";
// До этого зума точки группируются в кластеры, дальше — отдельные пины. Держим
// независимо от порога круга приватности: пины должны разворачиваться уже на
// городском масштабе (~8), а маленький круг 500 м появляется только вблизи (порог
// круга 13), иначе на городском зуме всё было бы кластерами.
const CLUSTER_MAX_ZOOM = 8;
const CLUSTER_RADIUS_PX = 58;
const LAYER_FADE_ZOOM_RANGE = 0.45;
const BASEMAP_LAYER_FADE_ZOOM_RANGE = 0.9;
const MAP_TILE_FADE_DURATION_MS = 420;
const MAX_MAP_ZOOM = 24;
const CIRCLE_FADE_START_ZOOM = LISTING_MAP_CIRCLE_ZOOM_THRESHOLD - LAYER_FADE_ZOOM_RANGE;
const CIRCLE_FADE_END_ZOOM = LISTING_MAP_CIRCLE_ZOOM_THRESHOLD + LAYER_FADE_ZOOM_RANGE;

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
  filter?: FilterSpecification;
  minzoom?: number;
  maxzoom?: number;
  "source-layer"?: string;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clampOpacity(value: number) {
  return Math.min(1, Math.max(0, value));
}

function expressionHasZoom(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.some((item) => item === "zoom" || expressionHasZoom(item));
}

function basemapRevealWindow(layer: BasemapLayerSpec) {
  return BASEMAP_REVEAL_WINDOWS[layer.id] ?? null;
}

function opacityFadeExpression(
  layer: BasemapLayerSpec,
  targetOpacity: unknown,
): PropertyValueSpecification<number> | null {
  const minZoom = finiteNumber(layer.minzoom);
  const maxZoom = finiteNumber(layer.maxzoom);
  const revealWindow = basemapRevealWindow(layer);
  const fadeInStart = revealWindow?.start ?? (minZoom != null ? minZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE : null);
  const fadeInEnd = revealWindow?.end ?? (minZoom != null ? minZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE : null);
  const shouldFadeIn = fadeInStart != null && fadeInEnd != null && fadeInEnd > fadeInStart;
  const shouldFadeOut = maxZoom != null && maxZoom < MAX_MAP_ZOOM - BASEMAP_LAYER_FADE_ZOOM_RANGE;

  if (!shouldFadeIn && !shouldFadeOut) return null;

  const stops: unknown[] = [];
  const pushStop = (zoom: number, opacity: unknown) => {
    const nextZoom = Math.min(MAX_MAP_ZOOM, Math.max(0, Number(zoom.toFixed(2))));
    const previousZoom = stops.length >= 2 ? stops[stops.length - 2] : null;
    if (typeof previousZoom === "number" && nextZoom <= previousZoom) return false;
    stops.push(nextZoom, typeof opacity === "number" ? clampOpacity(opacity) : opacity);
    return true;
  };

  if (shouldFadeIn && fadeInStart != null && fadeInEnd != null) {
    pushStop(fadeInStart, 0);
    pushStop(fadeInEnd, targetOpacity);
  } else {
    pushStop(0, targetOpacity);
  }

  if (shouldFadeOut && maxZoom != null) {
    const fadeOutStart = maxZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE;
    const previousZoomValue = stops.length >= 2 ? stops[stops.length - 2] : 0;
    const previousZoom = typeof previousZoomValue === "number" ? previousZoomValue : 0;
    const visibleUntilZoom = fadeOutStart > previousZoom ? fadeOutStart : Math.min(maxZoom, previousZoom + 0.01);
    pushStop(visibleUntilZoom, targetOpacity);
    pushStop(maxZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE, 0);
  }

  return ["interpolate", ["linear"], ["zoom"], ...stops] as PropertyValueSpecification<number>;
}

function applySmoothBasemapZoom(map: MlMap, layer: BasemapLayerSpec) {
  const revealWindow = basemapRevealWindow(layer);
  const opacityProperties = BASEMAP_OPACITY_PROPERTIES_BY_TYPE[layer.type];
  if (!opacityProperties && !revealWindow) return;

  let didSetOpacity = false;
  for (const property of opacityProperties ?? []) {
    const currentValue = map.getPaintProperty(layer.id, property) ?? layer.paint?.[property];
    if (currentValue != null && finiteNumber(currentValue) == null && expressionHasZoom(currentValue)) continue;

    const targetOpacity = finiteNumber(currentValue) ?? currentValue ?? 1;
    const expression = opacityFadeExpression(layer, targetOpacity);
    if (!expression) continue;

    map.setPaintProperty(layer.id, property, expression);
    didSetOpacity = true;
  }

  if (!didSetOpacity && !revealWindow) return;

  const minZoom = finiteNumber(layer.minzoom);
  const maxZoom = finiteNumber(layer.maxzoom);
  const fadeStartZoom = revealWindow?.start ?? (minZoom != null ? minZoom - BASEMAP_LAYER_FADE_ZOOM_RANGE : 0);
  const nextMinZoom = minZoom != null ? Math.max(0, Math.min(minZoom, fadeStartZoom)) : Math.max(0, fadeStartZoom);
  const nextMaxZoom =
    maxZoom != null && maxZoom < MAX_MAP_ZOOM - BASEMAP_LAYER_FADE_ZOOM_RANGE
      ? Math.min(MAX_MAP_ZOOM, maxZoom + BASEMAP_LAYER_FADE_ZOOM_RANGE)
      : (maxZoom ?? MAX_MAP_ZOOM);

  map.setLayerZoomRange(layer.id, nextMinZoom, nextMaxZoom);
}

function applyBasemapOverrides(map: MlMap, layer: BasemapLayerSpec) {
  const paintOverrides = BASEMAP_PAINT_OVERRIDES_BY_ID[layer.id];
  if (paintOverrides) {
    for (const [property, value] of Object.entries(paintOverrides)) {
      map.setPaintProperty(layer.id, property, value);
    }
  }

  const layoutOverrides = BASEMAP_LAYOUT_OVERRIDES_BY_ID[layer.id];
  if (layoutOverrides) {
    for (const [property, value] of Object.entries(layoutOverrides)) {
      map.setLayoutProperty(layer.id, property, value);
    }
  }
}

function hasTextLabel(map: MlMap, layer: BasemapLayerSpec) {
  return (
    layer.type === "symbol" && Boolean(map.getLayoutProperty(layer.id, "text-field") ?? layer.layout?.["text-field"])
  );
}

function labelZoneFilterFor(
  layer: BasemapLayerSpec,
  currentFilter: FilterSpecification | null,
): FilterSpecification | null {
  const filters: FilterSpecification[] = [];
  if (currentFilter) filters.push(currentFilter);
  if (shouldConstrainLabelLayerToPlatformZone(layer["source-layer"])) {
    filters.push(["within", RF_AND_BELARUS_LABEL_ZONE] as FilterSpecification);
  }
  if (filters.length === 0) return null;
  if (filters.length === 1 && filters[0]) return filters[0];
  return ["all", ...filters] as FilterSpecification;
}

function applyLabelZoneFilter(map: MlMap, layer: BasemapLayerSpec) {
  if (!hasTextLabel(map, layer)) return;
  const currentFilter = (map.getFilter(layer.id) ?? layer.filter ?? null) as FilterSpecification | null;
  const nextFilter = labelZoneFilterFor(layer, currentFilter);
  if (nextFilter) map.setFilter(layer.id, nextFilter);
}

// Приводим подложку к требованиям РФ: подписи — на русском, пограничные линии
// подложки скрываем (рисуем собственную зону). Работает для любого
// OpenMapTiles-совместимого стиля.
function applyRussianRfBasemap(map: MlMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const spec = layer as BasemapLayerSpec;
    try {
      if (shouldHideBasemapLayer(spec) || isBasemapTerrainLayer(spec)) {
        map.setLayoutProperty(spec.id, "visibility", "none");
        continue;
      }
      applyBasemapOverrides(map, spec);
      // Фирменная палитра (по OMT source-layer) — после точечных id-правок, чтобы
      // цвет суши/воды/леса/дорог был один и тот же на любом базовом стиле.
      const palette = basemapPaletteOverrides(spec);
      if (palette) {
        for (const [property, value] of Object.entries(palette)) {
          map.setPaintProperty(spec.id, property, value);
        }
      }
      applySmoothBasemapZoom(map, spec);
      // text-field может лежать в layout слоя ИЛИ быть применён через стиль —
      // надёжнее спросить у карты текущее значение.
      const textField = map.getLayoutProperty(spec.id, "text-field") ?? spec.layout?.["text-field"];
      if (spec.type === "symbol" && textField && JSON.stringify(textField).includes("name")) {
        map.setLayoutProperty(spec.id, "text-field", LABEL_TEXT_FIELD);
      }
      applyLabelZoneFilter(map, spec);
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

type PointProps = { id: string; color: string; material: string; fresh: boolean };

// Slug сырья объявления, приведённый к ключам палитры (для цвета пина и долей
// donut-кластера); всё за пределами трёх категорий — «прочее».
function materialSlugOf(categorySlug: string | undefined): keyof typeof MATERIAL_COLORS {
  return categorySlug && Object.hasOwn(MATERIAL_COLORS, categorySlug)
    ? (categorySlug as keyof typeof MATERIAL_COLORS)
    : "default";
}

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
          material: materialSlugOf(listing.positions[0]?.categorySlug),
          fresh: isFreshListing(listing.publishedAt),
        },
      }),
    ),
  };
}

// ── HTML-маркеры: пин-капля и donut-кластер ─────────────────────────────────
// Порядок долей donut совпадает с легендой/чипами фильтра.
const CLUSTER_MATERIAL_ORDER = ["makulatura", "plenki", "plastiki", "default"] as const;

const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
}

// Белая иконка-коробка (контур) на тёмной голове пина. Исходный ассет — 24×25
// (box.svg от владельца); масштабируем и центрируем в голову пина (~23,19.5).
function appendBoxIcon(svg: SVGElement) {
  const group = svgElement("g", {
    transform: "translate(12 8.3) scale(0.92)",
    fill: "#fff",
    "fill-rule": "evenodd",
  });
  group.append(
    svgElement("path", {
      d: "M12 22.7105L1.5 18.0405V6.23055L12 1.56055L22.5 6.23055V18.0405L12 22.7105ZM3 17.0705L12 21.0705L21 17.0705V7.21055L12 3.21054L3 7.21055V17.0705Z",
    }),
    svgElement("path", { d: "M12.75 10.3105H11.25V22.3005H12.75V10.3105Z" }),
    svgElement("path", {
      d: "M12.0006 11.8805L1.89062 7.39051L2.50061 6.02051L12.0006 10.2405L21.5606 6.02051L22.1706 7.39051L12.0006 11.8805Z",
    }),
  );
  svg.append(group);
}

// Пин по образцу gdebenz: тёмная круглая голова с цветным кольцом + цветной хвост
// (цвет = сырьё), белая иконка-коробка внутри. Свечение/пульс — через CSS по
// --marker-color. Строим через DOM (без innerHTML). viewBox 46×54 сохраняем (вся
// геометрия в его координатах), а рендер-размер уменьшен на ~10% (41×49).
function createPinElement(color: string, fresh: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `mp-pin${fresh ? " is-fresh" : ""}`;
  el.style.setProperty("--marker-color", color);
  const inner = document.createElement("div");
  inner.className = "mk-inner";
  const pulse = document.createElement("div");
  pulse.className = "mk-pulse";
  const svg = svgElement("svg", { width: 41, height: 49, viewBox: "0 0 46 54", "aria-hidden": "true" });
  svg.append(
    svgElement("path", { d: "M23 51 L15.5 35 L30.5 35 Z", fill: color }), // хвост-указатель
    svgElement("circle", { cx: 23, cy: 20, r: 17, fill: "rgba(9,14,22,0.92)", stroke: color, "stroke-width": 2.5 }),
  );
  appendBoxIcon(svg);
  inner.append(pulse, svg);
  el.append(inner);
  return el;
}

// Диаметр кластера растёт с числом объявлений (38→58 px).
function clusterDiameter(count: number): number {
  if (count < 10) return 38;
  if (count < 50) return 48;
  return 58;
}

// conic-gradient кольца donut по долям сырья в кластере.
function clusterRingGradient(counts: Record<string, number>, total: number): string {
  if (total <= 0) return MATERIAL_COLORS.default;
  const stops: string[] = [];
  let acc = 0;
  for (const slug of CLUSTER_MATERIAL_ORDER) {
    const value = counts[slug] ?? 0;
    if (value <= 0) continue;
    const from = (acc / total) * 360;
    acc += value;
    const to = (acc / total) * 360;
    stops.push(`${MATERIAL_COLORS[slug]} ${from}deg ${to}deg`);
  }
  return `conic-gradient(${stops.join(", ")})`;
}

function createClusterElement(count: number, counts: Record<string, number>): HTMLDivElement {
  const diameter = clusterDiameter(count);
  const el = document.createElement("div");
  el.className = "mp-cluster";
  el.style.width = `${diameter}px`;
  el.style.height = `${diameter}px`;
  const ring = document.createElement("div");
  ring.className = "mp-cluster-ring";
  ring.style.background = clusterRingGradient(counts, count);
  const core = document.createElement("div");
  core.className = "mp-cluster-core";
  const coreSize = diameter - 12;
  core.style.width = `${coreSize}px`;
  core.style.height = `${coreSize}px`;
  core.style.fontSize = `${count >= 100 ? 13 : 14}px`;
  core.textContent = String(count);
  el.append(ring, core);
  return el;
}

// Аккумулятор долей сырья в кластере (для donut-кольца).
type ClusterAccum = { mak: number; plen: number; plast: number; def: number };

// Клиентский индекс кластеризации. supercluster — тот же алгоритм, что MapLibre
// гоняет в воркере, но здесь считаем сами: getClusters(bbox, zoom) детерминированно
// отдаёт кластеры/точки под текущий вид, не завися от загрузки тайлов.
function buildClusterIndex(points: MarketplaceListingListItem[]): Supercluster<PointProps, ClusterAccum> {
  const index = new Supercluster<PointProps, ClusterAccum>({
    radius: CLUSTER_RADIUS_PX,
    maxZoom: CLUSTER_MAX_ZOOM,
    map: (props) => ({
      mak: props.material === "makulatura" ? 1 : 0,
      plen: props.material === "plenki" ? 1 : 0,
      plast: props.material === "plastiki" ? 1 : 0,
      def: props.material === "default" ? 1 : 0,
    }),
    reduce: (acc, props) => {
      acc.mak += props.mak;
      acc.plen += props.plen;
      acc.plast += props.plast;
      acc.def += props.def;
    },
  });
  index.load(pointsCollection(points).features);
  return index;
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
  // HTML-маркеры пинов/кластеров: все созданные (кэш по ключу) и видимые сейчас.
  const markersRef = useRef<Record<string, maplibregl.Marker>>({});
  const markersOnScreenRef = useRef<Record<string, maplibregl.Marker>>({});
  // Клиентский индекс кластеризации (supercluster) по текущему набору точек.
  const clusterIndexRef = useRef<Supercluster<PointProps, ClusterAccum> | null>(null);
  const [failed, setFailed] = useState(false);
  // Карта создана (можно включать кнопки управления) и режим 3D-перспективы.
  const [mapReady, setMapReady] = useState(false);
  const [pitched, setPitched] = useState(false);

  const points = listingPoints(listings);
  const pointsKey = points.map((listing) => `${listing.id}:${listing.circleLat},${listing.circleLon}`).join("|");
  // Через ref, чтобы setupMap/applyData всегда читали АКТУАЛЬНЫЙ набор точек, а не
  // замыкание момента маунта (иначе данные не выставятся, если объявления
  // загрузились раньше стиля карты).
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // Подсветка объекта: круг приватности — через feature-state, пин — через CSS-класс на
  // его HTML-маркере (если он сейчас на экране и не свёрнут в кластер).
  function setHover(id: string | null, on: boolean) {
    const map = mapRef.current;
    if (!map || !id || !readyRef.current) return;
    if (map.getSource(SRC_CIRCLES)) map.setFeatureState({ source: SRC_CIRCLES, id }, { hover: on });
    markersOnScreenRef.current[`p:${id}`]?.getElement().classList.toggle("is-hover", on);
  }

  // Перестроение HTML-маркеров под текущий вид: кластеры → donut, одиночные точки
  // → пин-капля. Кластеры берём из supercluster по bbox+зуму. Вызываем при
  // движении/зуме и после смены данных.
  function updateMarkers() {
    const map = mapRef.current;
    const index = clusterIndexRef.current;
    if (!map || !readyRef.current || !index) return;

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    const clusters = index.getClusters(bbox, Math.round(map.getZoom()));
    const next: Record<string, maplibregl.Marker> = {};

    for (const feature of clusters) {
      const coordinates = feature.geometry.coordinates as [number, number];
      const props = feature.properties;

      if ("cluster" in props && props.cluster) {
        const key = `c:${props.cluster_id}`;
        let marker = markersRef.current[key];
        if (!marker) {
          const element = createClusterElement(props.point_count, {
            makulatura: props.mak,
            plenki: props.plen,
            plastiki: props.plast,
            default: props.def,
          });
          element.addEventListener("click", () => {
            const zoom = index.getClusterExpansionZoom(props.cluster_id as number);
            suppressMovedUntilRef.current = Date.now() + 700;
            map.easeTo({ center: coordinates, zoom: Math.min(zoom, MAX_MAP_ZOOM) });
          });
          marker = markersRef.current[key] = new maplibregl.Marker({ element }).setLngLat(coordinates);
        }
        next[key] = marker;
        if (!markersOnScreenRef.current[key]) marker.addTo(map);
        continue;
      }

      const pointProps = props as PointProps;
      const id = pointProps.id;
      if (!id) continue;
      const key = `p:${id}`;
      let marker = markersRef.current[key];
      if (!marker) {
        const element = createPinElement(pointProps.color, pointProps.fresh);
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current?.(id);
        });
        element.addEventListener("mouseenter", () => {
          if (hoveredIdRef.current && hoveredIdRef.current !== id) setHover(hoveredIdRef.current, false);
          hoveredIdRef.current = id;
          setHover(id, true);
          onHoverRef.current?.(id);
        });
        element.addEventListener("mouseleave", () => {
          setHover(id, false);
          hoveredIdRef.current = null;
          onHoverRef.current?.(null);
        });
        marker = markersRef.current[key] = new maplibregl.Marker({
          element,
          anchor: "bottom",
          offset: [0, 3],
        }).setLngLat(coordinates);
      }
      next[key] = marker;
      if (!markersOnScreenRef.current[key]) marker.addTo(map);
    }

    for (const [key, marker] of Object.entries(markersOnScreenRef.current)) {
      if (!next[key]) marker.remove();
    }
    markersOnScreenRef.current = next;
    // Восстанавливаем подсветку наведённого пина после пересборки.
    if (hoveredIdRef.current) setHover(hoveredIdRef.current, true);
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

    const points = pointsRef.current;
    clusterIndexRef.current = buildClusterIndex(points);
    (map.getSource(SRC_CIRCLES) as GeoJSONSource | undefined)?.setData(circlesCollection(points));
    updateMarkers();

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
        minZoom: LISTING_MAP_MIN_ZOOM,
        fadeDuration: MAP_TILE_FADE_DURATION_MS,
        attributionControl: { compact: true },
      });
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    // Зум/поворот/3D — собственный оверлей (см. JSX ниже), а не угловой
    // NavigationControl: кнопки нужны по центру высоты + управление перспективой.
    setMapReady(true);

    // MapLibre сам следит лишь за ресайзом окна, но не за тем, как меняется размер
    // самого контейнера (переключатель «Список/Карта» на узких экранах, сворачивание
    // сайдбара). ResizeObserver гарантирует, что холст всегда занимает контейнер.
    const resizeObserver = new ResizeObserver(() => map.resize());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    map.on("error", () => undefined); // тайловые ошибки не должны валить компонент

    // Настройку вешаем на styledata, а НЕ на load: с обрезанными по зоне тайлами
    // часть вьюпорта пустая, из-за чего map.loaded() навсегда false и событие
    // load не наступает. styledata срабатывает после парса стиля (слои уже можно
    // добавлять). readyRef гарантирует однократный прогон.
    const setupMap = () => {
      if (readyRef.current || !mapRef.current) return;
      if (map.getSource(SRC_CIRCLES)) return;
      // Подложку — к виду РФ: русские подписи + скрытые пограничные линии.
      applyRussianRfBasemap(map);

      // Точки кластеризуем на клиенте (supercluster) — индекс строит applyData;
      // в MapLibre держим только источник круга приватности.
      map.addSource(SRC_CIRCLES, { type: "geojson", data: circlesCollection(pointsRef.current), promoteId: "id" });

      // Круг приватности 500 м — на крупном масштабе квартала.
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

      readyRef.current = true;
      applyData(fitOnDataChangeRef.current);

      // HTML-маркеры (пины/кластеры) пересобираем при любом изменении вида.
      map.on("move", updateMarkers);
      map.on("moveend", updateMarkers);

      // Намеренно НЕ вешаем mousemove/click на круг приватности: открыть объявление
      // и подсветить его можно только наведением/кликом по самому пину (его DOM-
      // события). Круг по-прежнему подсвечивается вместе с пином — setHover ставит
      // feature-state hover на источник кругов по id.
    };

    // styledata надёжно срабатывает после загрузки стиля; load оставляем как
    // дополнительный путь (на полных тайлах он сработает раньше).
    map.on("styledata", setupMap);
    map.on("load", setupMap);
    if (map.isStyleLoaded()) setupMap();

    map.on("moveend", emitBoundsIfUserMoved);

    return () => {
      readyRef.current = false;
      resizeObserver.disconnect();
      for (const marker of Object.values(markersRef.current)) marker.remove();
      markersRef.current = {};
      markersOnScreenRef.current = {};
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

  // ── Управление картой (собственный оверлей справа по центру высоты) ─────────
  function rotateBy(delta: number) {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: map.getBearing() + delta, duration: 250 });
  }

  function togglePitch() {
    const map = mapRef.current;
    if (!map) return;
    const next = !pitched;
    map.easeTo({ pitch: next ? 55 : 0, duration: 350 });
    setPitched(next);
  }

  function resetNorth() {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ bearing: 0, pitch: 0, duration: 350 });
    setPitched(false);
  }

  if (failed) {
    return <div className="mp-map-placeholder">Карта временно недоступна. Объявления показаны списком ниже.</div>;
  }

  return (
    <>
      <div ref={containerRef} className="mp-map" role="region" aria-label="Карта объявлений" />
      <div className="mp-map-ctrl" role="group" aria-label="Управление картой">
        <div className="mp-map-ctrl-group">
          <button
            type="button"
            className="mp-map-ctrl-btn"
            onClick={() => mapRef.current?.zoomIn()}
            disabled={!mapReady}
            aria-label="Приблизить"
            title="Приблизить"
          >
            <Plus size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mp-map-ctrl-btn"
            onClick={() => mapRef.current?.zoomOut()}
            disabled={!mapReady}
            aria-label="Отдалить"
            title="Отдалить"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="mp-map-ctrl-group">
          <button
            type="button"
            className={`mp-map-ctrl-btn${pitched ? " is-active" : ""}`}
            onClick={togglePitch}
            disabled={!mapReady}
            aria-pressed={pitched}
            aria-label={pitched ? "Выключить 3D-перспективу" : "Включить 3D-перспективу"}
            title="Режим 3D"
          >
            <Box size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mp-map-ctrl-btn"
            onClick={() => rotateBy(-30)}
            disabled={!mapReady}
            aria-label="Повернуть против часовой"
            title="Повернуть влево"
          >
            <RotateCcw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mp-map-ctrl-btn"
            onClick={() => rotateBy(30)}
            disabled={!mapReady}
            aria-label="Повернуть по часовой"
            title="Повернуть вправо"
          >
            <RotateCw size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="mp-map-ctrl-btn"
            onClick={resetNorth}
            disabled={!mapReady}
            aria-label="Сбросить ориентацию: север и без наклона"
            title="На север / сбросить наклон"
          >
            <Compass size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
    </>
  );
}
