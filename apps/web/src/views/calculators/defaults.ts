import type { TripCalcPayType, TripCalculatorSettings } from "@ecoplatform/shared";
import { MATERIAL_LEGEND } from "../marketplace/materials";

// Дефолтные ориентиры закупки/продажи (₽/кг) по slug материала. Заменяются
// заготовителем на свои и сохраняются в его настройках. Потом — вынести в админку.
const DEFAULT_MATERIAL_PRICES: Record<string, { buy: string; sell: string }> = {
  makulatura: { buy: "7", sell: "12" },
  plenki: { buy: "15", sell: "30" },
  plastiki: { buy: "12", sell: "25" },
  default: { buy: "0", sell: "0" },
};

// Схемы оплаты бригады (без зашитых ролей «водитель/грузчик» — любой работник
// со своей схемой). unit — подпись единицы рядом с полем значения.
export const PAY_TYPES: { value: TripCalcPayType; label: string; unit: string }[] = [
  { value: "hour", label: "по часам", unit: "₽/час" },
  { value: "trip", label: "фикс за рейс", unit: "₽" },
  { value: "percent", label: "% от рейса", unit: "%" },
  { value: "perTon", label: "за тонну", unit: "₽/т" },
  { value: "oklad", label: "оклад (уже платится)", unit: "" },
];

export const unitOf = (type: TripCalcPayType): string => PAY_TYPES.find((p) => p.value === type)?.unit ?? "";

let idSeq = 0;
// Короткий уникальный id для новых машин/работников (в пределах idField ≤ 40).
export const genId = (prefix: string): string => `${prefix}${Date.now().toString(36)}${(idSeq++).toString(36)}`;

// Стартовый набор, когда у компании ещё ничего не сохранено. Детерминирован
// (без Date на этом этапе) — безопасно для SSR/гидрации.
export function defaultSettings(): TripCalculatorSettings {
  return {
    version: 1,
    vehicles: [
      { id: "gazelle", name: "Газель", fuel: "15", deprec: "8", speed: "50" },
      { id: "truck5", name: "Грузовик 5т", fuel: "25", deprec: "15", speed: "55" },
    ],
    selectedVehicleId: "gazelle",
    workers: [{ id: "w1", name: "Водитель (он же грузчик)", type: "hour", value: "300", base: "margin" }],
    fuelPrice: "60",
    loadTime: "0.5",
    otherCosts: "0",
    materialPrices: MATERIAL_LEGEND.map((material) => ({
      slug: material.slug,
      buy: DEFAULT_MATERIAL_PRICES[material.slug]?.buy ?? "0",
      sell: DEFAULT_MATERIAL_PRICES[material.slug]?.sell ?? "0",
    })),
    amort: { repair: "120000", tires: "40000", replace: "150000", mileage: "40000" },
  };
}
