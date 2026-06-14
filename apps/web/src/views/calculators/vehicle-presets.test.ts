import { describe, expect, it } from "vitest";
import type { TripCalculatorSettings } from "@ecoplatform/shared";
import { removeVehiclePreset } from "./vehicle-presets";

function settings(selectedVehicleId: string, vehicles = baseVehicles): TripCalculatorSettings {
  return {
    version: 1,
    vehicles,
    selectedVehicleId,
    workers: [{ id: "w1", name: "Водитель", type: "hour", value: "300", base: "margin" }],
    fuelPrice: "60",
    loadTime: "0.5",
    otherCosts: "0",
    materialPrices: [{ slug: "makulatura", buy: "7", sell: "12" }],
    amort: { repair: "120000", tires: "40000", replace: "150000", mileage: "40000" },
  };
}

const baseVehicles: TripCalculatorSettings["vehicles"] = [
  { id: "gazelle", name: "Газель", fuel: "15", deprec: "8", speed: "50" },
  { id: "truck5", name: "Грузовик 5т", fuel: "25", deprec: "15", speed: "55" },
  { id: "van", name: "Фургон", fuel: "12", deprec: "6", speed: "60" },
];

describe("removeVehiclePreset", () => {
  it("удаляет активный пресет и выбирает следующий справа", () => {
    const result = removeVehiclePreset(settings("gazelle"), "gazelle");

    expect(result.vehicles.map((vehicle) => vehicle.id)).toEqual(["truck5", "van"]);
    expect(result.selectedVehicleId).toBe("truck5");
  });

  it("удаляет неактивный пресет и сохраняет текущий выбор", () => {
    const result = removeVehiclePreset(settings("gazelle"), "truck5");

    expect(result.vehicles.map((vehicle) => vehicle.id)).toEqual(["gazelle", "van"]);
    expect(result.selectedVehicleId).toBe("gazelle");
  });

  it("при удалении последнего активного пресета выбирает предыдущий", () => {
    const result = removeVehiclePreset(settings("van"), "van");

    expect(result.vehicles.map((vehicle) => vehicle.id)).toEqual(["gazelle", "truck5"]);
    expect(result.selectedVehicleId).toBe("truck5");
  });

  it("не удаляет единственный пресет", () => {
    const single = settings("gazelle", [baseVehicles[0]!]);
    const result = removeVehiclePreset(single, "gazelle");

    expect(result).toBe(single);
    expect(result.vehicles).toHaveLength(1);
    expect(result.selectedVehicleId).toBe("gazelle");
  });
});
