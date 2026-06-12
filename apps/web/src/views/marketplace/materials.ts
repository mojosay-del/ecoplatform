// Цвета категорий сырья — единый источник правды для карты (hex нужен в SVG и
// опциях Circle, где CSS-переменные недоступны), чипов фильтров, меток карточек
// и легенды. CSS-зеркало — блок --material-* в styles/tokens.css; синхронность
// двух источников проверяет materials.test.ts.

// Цвета по категории (как просил владелец): макулатура — коричневый, плёнки —
// синий, полимеры/пластики — жёлтый; прочее — зелёный Ecoplatform.
export const MATERIAL_COLORS = {
  makulatura: "#8a5a2b",
  plenki: "#1f6fb8",
  plastiki: "#d9a300",
  default: "#1f8a4c",
} as const satisfies Record<string, string>;

export function materialColor(categorySlug: string | undefined): string {
  if (categorySlug && Object.hasOwn(MATERIAL_COLORS, categorySlug)) {
    return MATERIAL_COLORS[categorySlug as keyof typeof MATERIAL_COLORS];
  }
  return MATERIAL_COLORS.default;
}

export type MaterialLegendItem = { slug: string; label: string; color: string };

// Порядок пунктов = порядок чипов фильтра сырья и легенды карты.
export const MATERIAL_LEGEND: MaterialLegendItem[] = [
  { slug: "makulatura", label: "Макулатура", color: MATERIAL_COLORS.makulatura },
  { slug: "plenki", label: "Плёнки", color: MATERIAL_COLORS.plenki },
  { slug: "plastiki", label: "Пластики", color: MATERIAL_COLORS.plastiki },
  { slug: "default", label: "Прочее", color: MATERIAL_COLORS.default },
];
