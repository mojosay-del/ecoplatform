// Вид материала номенклатуры выводится из её кода. Раньше материал задавался
// отдельной таблицей категорий (Макулатура/Плёнки/Пластики); после перехода
// индексов на плоский список категории убраны, но торговой площадке всё ещё
// нужен slug материала — для цвета кругов на карте, чипов фильтра и группировки
// в форме объявления. Код номенклатуры по соглашению начинается с префикса вида
// сырья (МКР/МКЛ — макулатура, ПЛН — плёнки, ПЛС — пластики); прочее → «default».
// Slug'и совпадают с MATERIAL_COLORS/MATERIAL_LEGEND на фронте.

export type NomenclatureMaterial = { slug: string; label: string };

const DEFAULT_MATERIAL: NomenclatureMaterial = { slug: "default", label: "Прочее" };

const CODE_PREFIX_MATERIALS: Array<{ prefixes: string[]; material: NomenclatureMaterial }> = [
  { prefixes: ["МКР", "МКЛ"], material: { slug: "makulatura", label: "Макулатура" } },
  { prefixes: ["ПЛН"], material: { slug: "plenki", label: "Плёнки" } },
  { prefixes: ["ПЛС"], material: { slug: "plastiki", label: "Пластики" } },
];

export function materialFromNomenclatureCode(code: string | null | undefined): NomenclatureMaterial {
  if (!code) return DEFAULT_MATERIAL;
  const normalized = code.trim().toUpperCase();
  for (const entry of CODE_PREFIX_MATERIALS) {
    if (entry.prefixes.some((prefix) => normalized.startsWith(prefix))) {
      return entry.material;
    }
  }
  return DEFAULT_MATERIAL;
}
