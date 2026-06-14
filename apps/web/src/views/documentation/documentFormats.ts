// Цвета форматов документов — единый источник правды для бейджей формата, чипов
// фильтра и иконок файлов в базе документации. По образцу materials.ts: один hex
// на «семью» формата. CSS-зеркало — блок --format-* в styles/tokens.css;
// синхронность двух источников проверяет documentFormats.test.ts.

// PDF — красный, текстовые документы — синий, таблицы — зелёный, презентации —
// оранжевый, архивы — фиолетовый, всё прочее — нейтральный серый.
export const FORMAT_COLORS = {
  pdf: "#d2322c",
  doc: "#2563aa",
  sheet: "#1f8a4c",
  slide: "#c4521f",
  archive: "#6f5fa6",
  default: "#6b7280",
} as const satisfies Record<string, string>;

export type FormatFamily = keyof typeof FORMAT_COLORS;

// Сопоставление расширения файла с «семьёй» формата (и её цветом).
const FORMAT_FAMILY: Record<string, FormatFamily> = {
  pdf: "pdf",
  doc: "doc",
  docx: "doc",
  rtf: "doc",
  txt: "doc",
  odt: "doc",
  xls: "sheet",
  xlsx: "sheet",
  csv: "sheet",
  ods: "sheet",
  ppt: "slide",
  pptx: "slide",
  odp: "slide",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  gz: "archive",
  tar: "archive",
};

export function formatFamily(format: string | undefined): FormatFamily {
  const key = format?.toLowerCase();
  if (key && Object.hasOwn(FORMAT_FAMILY, key)) {
    return FORMAT_FAMILY[key]!;
  }
  return "default";
}

export function formatColor(format: string | undefined): string {
  return FORMAT_COLORS[formatFamily(format)];
}

// Подпись на бейдже: расширение капсом ("DOCX"), либо «ФАЙЛ» для неизвестного.
export function formatLabel(format: string | undefined): string {
  return format && format !== "file" ? format.toUpperCase() : "ФАЙЛ";
}

export type FormatLegendItem = { family: FormatFamily; label: string; color: string };

export const FORMAT_LEGEND: FormatLegendItem[] = [
  { family: "pdf", label: "PDF", color: FORMAT_COLORS.pdf },
  { family: "doc", label: "Документы", color: FORMAT_COLORS.doc },
  { family: "sheet", label: "Таблицы", color: FORMAT_COLORS.sheet },
  { family: "slide", label: "Презентации", color: FORMAT_COLORS.slide },
  { family: "archive", label: "Архивы", color: FORMAT_COLORS.archive },
  { family: "default", label: "Прочее", color: FORMAT_COLORS.default },
];
