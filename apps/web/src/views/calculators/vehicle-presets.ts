import type { TripCalcVehicle, TripCalculatorSettings } from "@ecoplatform/shared";

type VehicleId = Pick<TripCalcVehicle, "id">;

export function nextVehicleIdAfterRemoval(
  vehicles: VehicleId[],
  selectedVehicleId: string | undefined,
  removedVehicleId: string,
): string | undefined {
  const removeIndex = vehicles.findIndex((vehicle) => vehicle.id === removedVehicleId);
  if (removeIndex === -1) {
    return selectedVehicleId && vehicles.some((vehicle) => vehicle.id === selectedVehicleId)
      ? selectedVehicleId
      : vehicles[0]?.id;
  }

  const remaining = vehicles.filter((vehicle) => vehicle.id !== removedVehicleId);
  if (remaining.length === 0) {
    return selectedVehicleId ?? vehicles[0]?.id;
  }

  if (
    selectedVehicleId &&
    selectedVehicleId !== removedVehicleId &&
    remaining.some((vehicle) => vehicle.id === selectedVehicleId)
  ) {
    return selectedVehicleId;
  }

  return remaining[Math.min(removeIndex, remaining.length - 1)]?.id;
}

export function removeVehiclePreset(settings: TripCalculatorSettings, vehicleId: string): TripCalculatorSettings {
  if (settings.vehicles.length <= 1 || !settings.vehicles.some((vehicle) => vehicle.id === vehicleId)) {
    return settings;
  }

  const vehicles = settings.vehicles.filter((vehicle) => vehicle.id !== vehicleId);
  return {
    ...settings,
    vehicles,
    selectedVehicleId:
      nextVehicleIdAfterRemoval(settings.vehicles, settings.selectedVehicleId, vehicleId) ?? vehicles[0]?.id,
  };
}
