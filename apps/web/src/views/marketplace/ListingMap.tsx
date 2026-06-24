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
import maplibregl, {
  type FilterSpecification,
  type GeoJSONSource,
  type Map as MlMap,
  type PropertyValueSpecification,
} from "maplibre-gl";
import { Protocol as PmtilesProtocol } from "pmtiles";
import { useEffect, useRef, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
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
const MAP_TILE_FADE_DURATION_MS = 420;
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

const HIDDEN_BASEMAP_LAYER_IDS = new Set(["label_state", "label_country_1", "label_country_2", "label_country_3"]);

const BASEMAP_REVEAL_WINDOWS: Record<string, { start: number; end: number }> = {
  airport: { start: 10.2, end: 11.8 },
  building: { start: 12.4, end: 14.2 },
  "highway-name-major": { start: 11.6, end: 13.4 },
  "highway-name-minor": { start: 14.2, end: 16.2 },
  "highway-name-path": { start: 15, end: 16.8 },
  highway_major_casing: { start: 9.4, end: 11.6 },
  highway_major_inner: { start: 9.4, end: 11.6 },
  highway_major_subtle: { start: 3.7, end: 7.2 },
  highway_minor: { start: 9.8, end: 12.4 },
  highway_motorway_bridge_casing: { start: 5.1, end: 7.1 },
  highway_motorway_bridge_inner: { start: 5.1, end: 7.1 },
  highway_motorway_casing: { start: 5.1, end: 7.1 },
  highway_motorway_inner: { start: 5.1, end: 7.1 },
  highway_motorway_subtle: { start: 2.9, end: 5.5 },
  highway_path: { start: 13, end: 15.5 },
  label_city: { start: 3.05, end: 5.2 },
  label_city_capital: { start: 2.55, end: 4.4 },
  label_other: { start: 11.2, end: 13.2 },
  label_town: { start: 5.1, end: 7.3 },
  label_village: { start: 9.1, end: 10.8 },
  landcover_wood: { start: 4.8, end: 9.4 },
  landuse_residential: { start: 7.6, end: 9.8 },
  park: { start: 3.8, end: 7.4 },
  railway: { start: 12.2, end: 14.2 },
  railway_dashline: { start: 12.2, end: 14.2 },
  road_shield_us: { start: 8.2, end: 10.2 },
  water_name_line_label: { start: 5.2, end: 8.2 },
  water_name_point_label: { start: 5.2, end: 8.2 },
  waterway: { start: 3.1, end: 8.2 },
  waterway_line_label: { start: 9.8, end: 11.6 },
};

const BASEMAP_PAINT_OVERRIDES_BY_ID: Record<string, Record<string, unknown>> = {
  building: {
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 12.4, 0, 14.2, 0.55, 16, 0.75],
  },
  "highway-name-major": {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.6, 0, 13.4, 0.9],
  },
  "highway-name-minor": {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 14.2, 0, 16.2, 0.82],
  },
  "highway-name-path": {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 16.8, 0.72],
  },
  highway_major_casing: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 9.4, 0, 11.6, 0.78, 14, 0.9],
    "line-width": ["interpolate", ["exponential", 1.25], ["zoom"], 9.4, 0.35, 11, 1.2, 14, 5, 18, 15],
  },
  highway_major_inner: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 9.4, 0, 11.6, 0.9],
    "line-width": ["interpolate", ["exponential", 1.25], ["zoom"], 9.4, 0.2, 11, 0.8, 14, 3.6, 18, 12],
  },
  highway_major_subtle: {
    "line-color": "hsl(0, 0%, 82%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.7, 0, 4.4, 0.2, 5.8, 0.38, 8.6, 0.6, 11, 0],
    "line-width": ["interpolate", ["linear"], ["zoom"], 3.7, 0.18, 5.2, 0.36, 8, 0.85, 11, 1.6],
  },
  highway_minor: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 9.8, 0, 12.4, 0.58, 15, 0.82],
    "line-width": ["interpolate", ["exponential", 1.25], ["zoom"], 9.8, 0.15, 12, 0.75, 15, 2.4, 19, 11],
  },
  highway_motorway_bridge_casing: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.1, 0.9],
    "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 5.1, 0.45, 7, 2, 11, 4, 16, 15],
  },
  highway_motorway_bridge_inner: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.1, 1],
    "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 5.1, 0.25, 7, 1.2, 11, 2.8, 16, 11],
  },
  highway_motorway_casing: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.1, 0.9],
    "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 5.1, 0.4, 7, 1.8, 11, 3.8, 16, 14],
  },
  highway_motorway_inner: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.1, 1],
    "line-width": ["interpolate", ["exponential", 1.35], ["zoom"], 5.1, 0.2, 7, 1.1, 11, 2.6, 16, 10],
  },
  highway_motorway_subtle: {
    "line-color": "hsl(0, 0%, 78%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.9, 0, 3.6, 0.24, 4.8, 0.52, 5.8, 0.7],
    "line-width": ["interpolate", ["linear"], ["zoom"], 2.9, 0.16, 4.2, 0.35, 5.8, 1.1],
  },
  highway_path: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, 0.46, 18, 0.7],
    "line-width": ["interpolate", ["exponential", 1.15], ["zoom"], 13, 0.2, 15, 0.7, 19, 4],
  },
  label_city: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 3.05, 0, 3.8, 0.32, 5.2, 0.78, 6.9, 0.88],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 3.05, 0, 3.8, 0.46, 4.7, 0.82, 6.6, 0.95],
  },
  label_city_capital: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 2.55, 0, 3.25, 0.68, 4.4, 0.92],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 2.55, 0, 3.25, 0.76, 4.4, 1],
  },
  label_other: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.2, 0, 13.2, 0.72],
  },
  label_town: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.3, 0.72],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 5.1, 0, 7.3, 0.9],
  },
  label_village: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 9.1, 0, 10.8, 0.45],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 9.1, 0, 10.8, 0.78],
  },
  landcover_wood: {
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4.8, 0, 6.4, 0.08, 8, 0.18, 12, 0.48, 15, 0.62],
  },
  landuse_residential: {
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7.6, 0, 9.8, 0.18, 12, 0.34],
  },
  park: {
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3.8, 0, 5.4, 0.08, 7.4, 0.18, 10, 0.3],
  },
  railway: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 12.2, 0, 14.2, 0.45, 17, 0.7],
    "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 12.2, 0.2, 15, 1.1, 19, 4.5],
  },
  railway_dashline: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 12.2, 0, 14.2, 0.6],
    "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 12.2, 0.15, 15, 0.8, 19, 3.5],
  },
  road_shield_us: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 8.2, 0, 10.2, 0.82],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 8.2, 0, 10.2, 0.9],
  },
  water_name_line_label: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 5.2, 0, 8.2, 0.58],
  },
  water_name_point_label: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 5.2, 0, 8.2, 0.58],
  },
  waterway: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.1, 0, 4.4, 0.22, 6.4, 0.44, 8.4, 0.64, 12, 0.78],
    "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 3.1, 0.1, 5.5, 0.28, 8, 0.62, 14, 1.7],
  },
  waterway_line_label: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 9.8, 0, 11.6, 0.52],
  },
};

const BASEMAP_LAYOUT_OVERRIDES_BY_ID: Record<string, Record<string, unknown>> = {
  label_city: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 3.05, 0.1, 5.2, 0.2, 7, 0.32, 9, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 3.05, 9.5, 5, 10.5, 7, 12, 11, 16],
  },
  label_city_capital: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2.55, 0.2, 7, 0.44, 9, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 2.8, 10.8, 7, 14, 11, 18],
  },
  label_other: {
    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 8, 14, 10],
  },
  label_town: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 5.1, 0.1, 8, 0.18, 10, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 5, 9, 8, 11, 12, 13],
  },
  label_village: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 9.1, 0.08, 10.5, 0],
    "text-size": ["interpolate", ["exponential", 1.12], ["zoom"], 9, 8.5, 11, 10.5, 14, 12],
  },
};

// Тайлы подложки обрезаны по зоне Экоплатформы (РФ+новые территории+РБ) ещё на
// этапе генерации, поэтому вне зоны данных нет вовсе — и НЕ рисуем ни линий
// госграниц, ни заливки-маски (чище и без территориальных акцентов).
const FIT_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };

// Маска только для фильтра подписей. Она НЕ рисуется на карте: геометрия нужна,
// чтобы не показывать названия за пределами РФ-зоны по выбранной правовой логике
// и Беларуси. Контур упрощён для клиентской маски: он не заменяет геоданные
// тайлов, а закрывает видимый слой подписей без отрисовки государственных границ.
const RF_AND_BELARUS_LABEL_ZONE: MultiPolygon = {
  type: "MultiPolygon",
  coordinates: [
    [
      [
        [30.8, 69.8],
        [40, 70.8],
        [60, 70.2],
        [82, 72.8],
        [105, 77.4],
        [135, 76.5],
        [160, 72.5],
        [180, 71.5],
        [180, 60],
        [168, 60],
        [158, 58.5],
        [151, 54.5],
        [142, 52],
        [135, 47.7],
        [132, 43],
        [124, 42],
        [119, 49.5],
        [112, 49.5],
        [106, 51.1],
        [98, 50.2],
        [92, 50.5],
        [87, 49],
        [82, 50.2],
        [76, 53.3],
        [68, 54.8],
        [61, 53.7],
        [56, 51],
        [51, 50.5],
        [47.2, 47],
        [44, 43.2],
        [41, 43.2],
        [38.8, 45.2],
        [40.2, 47.8],
        [39.8, 50.2],
        [37.2, 51.1],
        [34.5, 51.5],
        [32, 53.7],
        [31, 56],
        [28.5, 58],
        [29, 60.2],
        [31.2, 62.5],
        [30, 65.5],
        [30.8, 69.8],
      ],
    ],
    [
      [
        [19.4, 54.2],
        [22.9, 54.2],
        [22.9, 55.4],
        [19.4, 55.4],
        [19.4, 54.2],
      ],
    ],
    [
      [
        [23.1, 51.1],
        [24, 52.1],
        [23.4, 53.6],
        [24.7, 55],
        [27.4, 56.2],
        [30.9, 55.4],
        [32.8, 53.6],
        [31.6, 51.3],
        [28.2, 51.2],
        [25.2, 51],
        [23.1, 51.1],
      ],
    ],
    [
      [
        [36.8, 50.4],
        [40.3, 50.3],
        [40.4, 47.8],
        [38.2, 47],
        [36.8, 47.3],
        [36.8, 50.4],
      ],
    ],
    [
      [
        [31.4, 46],
        [32.7, 47.5],
        [35.2, 48.1],
        [37, 47.2],
        [38.1, 46.4],
        [36.2, 45.3],
        [33, 45.2],
        [31.4, 46],
      ],
    ],
    [
      [
        [31.8, 44.3],
        [33.1, 45.6],
        [36.7, 45.5],
        [36.9, 44.8],
        [34.8, 44.2],
        [32.8, 44.1],
        [31.8, 44.3],
      ],
    ],
    [
      [
        [140.5, 45],
        [146.5, 45],
        [146.5, 55.5],
        [140.5, 55.5],
        [140.5, 45],
      ],
    ],
    [
      [
        [154, 50],
        [166, 50],
        [166, 63],
        [154, 63],
        [154, 50],
      ],
    ],
    [
      [
        [-180, 60],
        [-168, 60],
        [-168, 72],
        [-180, 72],
        [-180, 60],
      ],
    ],
  ],
};

const HIDDEN_LABEL_NAMES = ["Автономная Республика Крым"];

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
  filter?: FilterSpecification;
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

function labelZoneFilterFor(layer: BasemapLayerSpec, currentFilter: FilterSpecification | null): FilterSpecification {
  const filters: FilterSpecification[] = [];
  if (currentFilter) filters.push(currentFilter);
  if (layer["source-layer"]) filters.push(["within", RF_AND_BELARUS_LABEL_ZONE] as FilterSpecification);
  if (layer["source-layer"] === "place") {
    filters.push([
      "!",
      [
        "match",
        ["coalesce", ["get", "name:ru"], ["get", "name"], ["get", "name_en"], ""],
        HIDDEN_LABEL_NAMES,
        true,
        false,
      ],
    ] as FilterSpecification);
  }
  if (filters.length === 1 && filters[0]) return filters[0];
  return ["all", ...filters] as FilterSpecification;
}

function applyLabelZoneFilter(map: MlMap, layer: BasemapLayerSpec) {
  if (!hasTextLabel(map, layer)) return;
  const currentFilter = (map.getFilter(layer.id) ?? layer.filter ?? null) as FilterSpecification | null;
  map.setFilter(layer.id, labelZoneFilterFor(layer, currentFilter));
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
      if (HIDDEN_BASEMAP_LAYER_IDS.has(spec.id)) {
        map.setLayoutProperty(spec.id, "visibility", "none");
        continue;
      }
      applyBasemapOverrides(map, spec);
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
        fadeDuration: MAP_TILE_FADE_DURATION_MS,
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
