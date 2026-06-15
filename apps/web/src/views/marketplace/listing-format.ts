// Чистые форматтеры площадки без React/JSX — чтобы их могли импортировать и
// pure-модули (listing-form.helpers.ts) без подтягивания JSX в граф vitest.

export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    const tons = kg / 1000;
    return `${Number.isInteger(tons) ? tons : tons.toFixed(1)} т`;
  }
  return `${Math.round(kg)} кг`;
}
