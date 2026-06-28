import { pluralizeRu } from "../../../lib/ru-plural";

export function formatPriceValuesCount(count: number) {
  return `${count} ${pluralizeRu(count, "значение", "значения", "значений")} истории цен`;
}

// Значение индекса (число с одним знаком после запятой, ru-RU) — общий форматтер.
export { formatDecimal1 as formatIndexPrice } from "../../../lib/formatters";
