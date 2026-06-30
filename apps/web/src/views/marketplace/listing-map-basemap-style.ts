// Табличные данные стилизации векторной подложки карты (OpenMapTiles-схема).
// Чистые справочники — без логики; применяет их `applyRussianRfBasemap` в
// ListingMap.tsx. Вынесено сюда, чтобы компонент карты держал жизненный цикл
// MapLibre, а не сотни строк per-layer констант.
//
// Числа выверены на глаз под светлый стиль positron: окна зума, при которых
// слой плавно проявляется/гаснет, и точечные правки прозрачности/толщины,
// чтобы дороги/подписи читались без визуального шума.

// Какие paint-свойства отвечают за прозрачность у каждого типа слоя MapLibre —
// нужно, чтобы навешивать плавный зум-фейд на произвольный слой подложки.
export const BASEMAP_OPACITY_PROPERTIES_BY_TYPE: Record<string, readonly string[]> = {
  circle: ["circle-opacity", "circle-stroke-opacity"],
  fill: ["fill-opacity"],
  "fill-extrusion": ["fill-extrusion-opacity"],
  heatmap: ["heatmap-opacity"],
  line: ["line-opacity"],
  raster: ["raster-opacity"],
  symbol: ["text-opacity", "icon-opacity"],
};

// Окно зума [start, end], в котором слой плавно проявляется. Без записи здесь
// слой использует свои minzoom/maxzoom ± BASEMAP_LAYER_FADE_ZOOM_RANGE.
export const BASEMAP_REVEAL_WINDOWS: Record<string, { start: number; end: number }> = {
  airport: { start: 10.2, end: 11.8 },
  building: { start: 12.4, end: 14.2 },
  "highway-name-major": { start: 11.6, end: 13.4 },
  "highway-name-minor": { start: 14.2, end: 16.2 },
  "highway-name-path": { start: 15, end: 16.8 },
  highway_major_casing: { start: 9.4, end: 11.6 },
  highway_major_inner: { start: 9.4, end: 11.6 },
  highway_major_subtle: { start: 3.15, end: 6 },
  highway_minor: { start: 9.8, end: 12.4 },
  highway_motorway_bridge_casing: { start: 5.1, end: 7.1 },
  highway_motorway_bridge_inner: { start: 5.1, end: 7.1 },
  highway_motorway_casing: { start: 5.1, end: 7.1 },
  highway_motorway_inner: { start: 5.1, end: 7.1 },
  highway_motorway_subtle: { start: 2.65, end: 5.2 },
  highway_path: { start: 13, end: 15.5 },
  label_city: { start: 2.85, end: 4.7 },
  label_city_capital: { start: 2.35, end: 4.1 },
  label_other: { start: 11.2, end: 13.2 },
  label_town: { start: 4.2, end: 6.2 },
  label_village: { start: 9.1, end: 10.8 },
  landcover_glacier: { start: 3.2, end: 6.8 },
  landcover_ice_shelf: { start: 3.2, end: 6.8 },
  landcover_wood: { start: 3.4, end: 7.1 },
  landuse_residential: { start: 6.1, end: 8.8 },
  park: { start: 3.2, end: 6.4 },
  railway: { start: 12.2, end: 14.2 },
  railway_dashline: { start: 12.2, end: 14.2 },
  road_shield_us: { start: 8.2, end: 10.2 },
  water_name_line_label: { start: 5.2, end: 8.2 },
  water_name_point_label: { start: 5.2, end: 8.2 },
  waterway: { start: 3.1, end: 8.2 },
  waterway_line_label: { start: 9.8, end: 11.6 },
};

// Точечные переопределения paint-свойств конкретных слоёв подложки.
export const BASEMAP_PAINT_OVERRIDES_BY_ID: Record<string, Record<string, unknown>> = {
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
    "line-color": "hsl(0, 0%, 77%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.15, 0.08, 3.8, 0.24, 4.6, 0.38, 6, 0.52, 8.6, 0.64, 11, 0],
    "line-width": ["interpolate", ["linear"], ["zoom"], 3.15, 0.14, 4.6, 0.28, 6.4, 0.55, 8.8, 0.95, 11, 1.6],
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
    "line-color": "hsl(0, 0%, 74%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 2.65, 0.08, 3.25, 0.28, 4.2, 0.5, 5.8, 0.72],
    "line-width": ["interpolate", ["linear"], ["zoom"], 2.65, 0.14, 3.8, 0.32, 5.8, 1.12],
  },
  highway_path: {
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 15.5, 0.46, 18, 0.7],
    "line-width": ["interpolate", ["exponential", 1.15], ["zoom"], 13, 0.2, 15, 0.7, 19, 4],
  },
  label_city: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 2.85, 0, 3.35, 0.36, 5, 0.82, 6.9, 0.9],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 2.85, 0, 3.35, 0.56, 4.35, 0.84, 6.4, 0.95],
  },
  label_city_capital: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 2.35, 0, 3.05, 0.68, 4.1, 0.92],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 2.35, 0, 3.05, 0.78, 4.1, 1],
  },
  label_other: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 11.2, 0, 13.2, 0.72],
  },
  label_town: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 4.2, 0, 4.9, 0.34, 6.2, 0.72],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 4.2, 0, 4.75, 0.45, 5.6, 0.78, 7, 0.9],
  },
  label_village: {
    "icon-opacity": ["interpolate", ["linear"], ["zoom"], 9.1, 0, 10.8, 0.45],
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 9.1, 0, 10.8, 0.78],
  },
  landcover_glacier: {
    "fill-color": "hsl(200, 20%, 87%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3.2, 0, 4.8, 0.16, 7.4, 0.28, 10, 0.34],
  },
  landcover_ice_shelf: {
    "fill-color": "hsl(200, 18%, 88%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3.2, 0, 4.8, 0.12, 7.4, 0.22, 10, 0.28],
  },
  landcover_wood: {
    "fill-color": "hsl(112, 18%, 82%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3.4, 0, 4.4, 0.06, 6.6, 0.16, 9, 0.28, 12, 0.5, 15, 0.62],
  },
  landuse_residential: {
    "fill-color": "hsl(52, 17%, 88%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6.1, 0, 8, 0.1, 10.5, 0.22, 12.5, 0.34],
  },
  park: {
    "fill-color": "hsl(104, 22%, 84%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3.2, 0, 4.6, 0.07, 6.4, 0.16, 8.4, 0.24, 10, 0.32],
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
  water: {
    "fill-color": "hsl(198, 22%, 82%)",
    "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.78, 6, 0.82, 12, 0.88],
  },
  waterway: {
    "line-color": "hsl(198, 28%, 72%)",
    "line-opacity": ["interpolate", ["linear"], ["zoom"], 3.1, 0, 4.2, 0.24, 6.4, 0.5, 8.4, 0.68, 12, 0.8],
    "line-width": ["interpolate", ["exponential", 1.2], ["zoom"], 3.1, 0.1, 5.5, 0.3, 8, 0.66, 14, 1.72],
  },
  waterway_line_label: {
    "text-opacity": ["interpolate", ["linear"], ["zoom"], 9.8, 0, 11.6, 0.52],
  },
};

// ── Фирменная палитра подложки ─────────────────────────────────────────────
// Светлая «почти белая» суша, серая (НЕ синяя) вода, приглушённый зелёный лес,
// тёмные дороги с иерархией. Применяется поверх любого OpenMapTiles-стиля через
// basemapPaletteOverrides (см. ниже) — поэтому одинаково красит и dev-positron,
// и боевой self-host, не завися от конкретных id слоёв.
export const BASEMAP_PALETTE = {
  land: "#f6f5f2",
  water: "#dbe0e6",
  waterway: "#cdd3da",
  wood: "#dce8d3",
  grass: "#e7efe0",
  ice: "#eef1f3",
  roadMajor: "#3f444c",
  roadSecondary: "#71777f",
  roadMinor: "#aab0b8",
} as const;

type PaletteLayerLike = { id: string; type: string; "source-layer"?: string };

const ROAD_COLOR_BY_CLASS: unknown = [
  "match",
  ["get", "class"],
  ["motorway", "trunk", "primary"],
  BASEMAP_PALETTE.roadMajor,
  ["secondary", "tertiary"],
  BASEMAP_PALETTE.roadSecondary,
  BASEMAP_PALETTE.roadMinor,
];

const LANDCOVER_COLOR_BY_CLASS: unknown = [
  "match",
  ["get", "class"],
  ["wood", "forest"],
  BASEMAP_PALETTE.wood,
  ["grass", "meadow", "park", "scrub", "heath"],
  BASEMAP_PALETTE.grass,
  ["ice", "glacier"],
  BASEMAP_PALETTE.ice,
  BASEMAP_PALETTE.grass,
];

// Универсальная перекраска слоя по OMT source-layer/типу. Имена source-layer в
// OpenMapTiles стандартизированы (water/waterway/landcover/park/transportation),
// в отличие от id слоёв (у positron и боевого стиля они разные) — поэтому красим
// именно по ним. Возвращает paint-свойства для setPaintProperty или null.
export function basemapPaletteOverrides(layer: PaletteLayerLike): Record<string, unknown> | null {
  const sourceLayer = layer["source-layer"];
  if (layer.type === "background") return { "background-color": BASEMAP_PALETTE.land };
  if (sourceLayer === "water") return { "fill-color": BASEMAP_PALETTE.water };
  if (sourceLayer === "waterway") return { "line-color": BASEMAP_PALETTE.waterway };
  if (sourceLayer === "park") return { "fill-color": BASEMAP_PALETTE.wood };
  if (sourceLayer === "landcover") return { "fill-color": LANDCOVER_COLOR_BY_CLASS };
  if (sourceLayer === "transportation" && layer.type === "line") return { "line-color": ROAD_COLOR_BY_CLASS };
  return null;
}

// Слои рельефа/hillshade боевого стиля: тянут DEM-тайлы Terrarium со стороннего
// источника (AWS) и делают карту «атласной». Прячем — чище и без внешней
// зависимости. На dev-positron таких слоёв нет, проверка безвредна.
export function isBasemapTerrainLayer(layer: PaletteLayerLike): boolean {
  return layer.type === "hillshade" || /hillshade|terrain|relief|dem/i.test(layer.id);
}

// Точечные переопределения layout-свойств (размеры подписей/иконок) отдельных
// слоёв подложки.
export const BASEMAP_LAYOUT_OVERRIDES_BY_ID: Record<string, Record<string, unknown>> = {
  label_city: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2.85, 0.1, 5, 0.2, 7, 0.32, 9, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 2.85, 9.2, 5, 10.8, 7, 12, 11, 16],
  },
  label_city_capital: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 2.35, 0.2, 7, 0.44, 9, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 2.55, 10.8, 7, 14, 11, 18],
  },
  label_other: {
    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 8, 14, 10],
  },
  label_town: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 4.2, 0.08, 6.2, 0.14, 8, 0.18, 10, 0],
    "text-size": ["interpolate", ["exponential", 1.15], ["zoom"], 4.2, 8.2, 5.5, 9.2, 8, 11, 12, 13],
  },
  label_village: {
    "icon-size": ["interpolate", ["linear"], ["zoom"], 9.1, 0.08, 10.5, 0],
    "text-size": ["interpolate", ["exponential", 1.12], ["zoom"], 9, 8.5, 11, 10.5, 14, 12],
  },
};
