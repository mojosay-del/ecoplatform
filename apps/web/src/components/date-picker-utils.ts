// Чистые помощники для DatePicker. Без побочных эффектов — легко тестировать.
// Формат обмена — ISO-дата "yyyy-mm-dd" (как у нативного <input type="date">),
// чтобы остальной код (например PriceIndexCard) не менялся.

const pad2 = (value: number) => String(value).padStart(2, "0");

export const RU_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export const RU_MONTHS = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

// Локальные y/m/d → ISO (без сдвига по часовому поясу, в отличие от toISOString).
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  return { year, month, day };
}

// "yyyy-mm-dd" → "дд.мм.гггг" для отображения. Пустую/битую строку → "".
export function formatRuDate(iso: string): string {
  const parsed = parseIsoDate(iso);
  if (!parsed) return "";
  return `${pad2(parsed.day)}.${pad2(parsed.month + 1)}.${parsed.year}`;
}

export type MonthCell = { date: Date; inMonth: boolean; iso: string };

// Сетка месяца 6×7, неделя начинается с понедельника (как принято в RU).
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const first = new Date(year, month, 1);
  const startWeekday = (first.getDay() + 6) % 7; // Пн = 0
  const gridStart = new Date(year, month, 1 - startWeekday);

  const cells: MonthCell[] = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    cells.push({ date, inMonth: date.getMonth() === month, iso: toIsoDate(date) });
  }
  return cells;
}
