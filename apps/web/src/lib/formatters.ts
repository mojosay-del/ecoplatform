// Единый дом для локализованных (ru-RU) форматтеров, которые переиспользуются
// несколькими экранами как есть. Intl-инстансы кэшируем на уровне модуля — они
// дорогие в конструировании, а формат один на всё приложение.
//
// Доменно-специфичные форматтеры живут рядом со своими view и сюда не выносятся:
// валюта/единицы калькулятора (`rub`/`km`/`kg`), подписи дат индексов,
// «N мин назад» дашборда, полнолетние даты (DD.MM.YYYY) — у них свой формат.

const decimal1Format = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short" });

// Число с одним знаком после запятой (ru-RU). Используется для значений ценовых
// индексов в публичном и админском разделах (был дубль formatIndexPrice ×2).
export function formatDecimal1(value: string | number): string {
  return decimal1Format.format(Number(value));
}

// «12.06.26, 14:30» — короткие дата и время ru-RU. null/невалидное → «—».
// Общий формат для кабинета, сессий и обращений поддержки.
export function formatDateTime(value?: string | number | Date | null): string {
  if (value === null || value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date);
}
