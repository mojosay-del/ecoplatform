import { filterPriceIndexPoints, type PriceIndexPoint } from "@ecoplatform/shared";

// Набор горизонтов графика индекса цен (в днях), которые ждёт фронт.
// Каждое окно — отфильтрованный по дате срез временного ряда значений.
export function buildPriceIndexChart(values: PriceIndexPoint[]) {
  return {
    "2W": filterPriceIndexPoints(values, 14),
    "1M": filterPriceIndexPoints(values, 30),
    "3M": filterPriceIndexPoints(values, 90),
    "6M": filterPriceIndexPoints(values, 180),
    "1Y": filterPriceIndexPoints(values, 365),
    "2Y": filterPriceIndexPoints(values, 730),
    "3Y": filterPriceIndexPoints(values, 1095),
  };
}
