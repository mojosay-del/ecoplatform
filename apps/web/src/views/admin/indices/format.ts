import { pluralizeRu } from "../../../lib/ru-plural";

export function formatPriceValuesCount(count: number) {
  return `${count} ${pluralizeRu(count, "значение", "значения", "значений")} истории цен`;
}

export function formatIndexPrice(value: string | number) {
  return Number(value).toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}
