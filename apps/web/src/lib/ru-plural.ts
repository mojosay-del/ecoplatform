// Русское склонение существительного по числу.
// pluralizeRu(2, "день", "дня", "дней") → "дня".
//   one  — форма для 1, 21, 31, … (но не 11)
//   few  — форма для 2–4, 22–24, … (но не 12–14)
//   many — форма для 0, 5–20, 11–14, …
export function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}
