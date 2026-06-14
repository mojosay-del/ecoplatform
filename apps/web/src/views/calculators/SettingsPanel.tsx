"use client";

import { useMemo, useState } from "react";
import { Calculator, ChevronDown, Fuel, Settings2, UserPlus, Users, Wrench, X } from "lucide-react";
import type { TripCalculatorSettings } from "@ecoplatform/shared";
import { Field } from "./Field";
import { Segmented } from "./Segmented";
import { PAY_TYPES, genId, unitOf } from "./defaults";
import { num } from "./trip-economics";

type SettingsPanelProps = {
  settings: TripCalculatorSettings;
  update: (updater: (prev: TripCalculatorSettings) => TripCalculatorSettings) => void;
  vehicleId: string;
};

// Редкие настройки (правятся не каждый рейс): бригада и оплата, параметры
// выбранной машины, топливо, помощник амортизации. Свёрнуто по умолчанию —
// обычный сценарий идёт через карточку «Заявка».
export function SettingsPanel({ settings, update, vehicleId }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [showAmort, setShowAmort] = useState(false);
  // Схема гарантирует ≥1 машину; фолбэк — лишь чтобы успокоить TS при пустом
  // (теоретически невозможном) списке.
  const veh = settings.vehicles.find((vehicle) => vehicle.id === vehicleId) ??
    settings.vehicles[0] ?? { id: "", name: "Машина", fuel: "0", deprec: "0", speed: "0" };

  const updateVehicle = (patch: Partial<TripCalculatorSettings["vehicles"][number]>) =>
    update((prev) => ({
      ...prev,
      vehicles: prev.vehicles.map((vehicle) => (vehicle.id === veh.id ? { ...vehicle, ...patch } : vehicle)),
    }));

  const updateWorker = (id: string, patch: Partial<TripCalculatorSettings["workers"][number]>) =>
    update((prev) => ({
      ...prev,
      workers: prev.workers.map((worker) => (worker.id === id ? { ...worker, ...patch } : worker)),
    }));

  const removeWorker = (id: string) =>
    update((prev) => ({ ...prev, workers: prev.workers.filter((worker) => worker.id !== id) }));

  const addWorker = () =>
    update((prev) => ({
      ...prev,
      workers: [
        ...prev.workers,
        { id: genId("w"), name: `Работник ${prev.workers.length + 1}`, type: "hour", value: "250", base: "margin" },
      ],
    }));

  const setField = (key: "fuelPrice" | "loadTime" | "otherCosts", value: string) =>
    update((prev) => ({ ...prev, [key]: value }));

  const updateAmort = (patch: Partial<TripCalculatorSettings["amort"]>) =>
    update((prev) => ({ ...prev, amort: { ...prev.amort, ...patch } }));

  const amortValue = useMemo(() => {
    const mileage = num(settings.amort.mileage);
    return mileage > 0
      ? (num(settings.amort.repair) + num(settings.amort.tires) + num(settings.amort.replace)) / mileage
      : 0;
  }, [settings.amort]);

  return (
    <section className="tc-card tc-settings">
      <button type="button" className="tc-settings-toggle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="tc-settings-title">
          <Settings2 size={16} aria-hidden /> Настройки <span className="tc-settings-veh">({veh.name})</span>
        </span>
        <ChevronDown size={16} aria-hidden className={`tc-chevron${open ? " is-open" : ""}`} />
      </button>

      {open ? (
        <div className="tc-settings-body">
          <div className="tc-group">
            <div className="tc-group-label">
              <Users size={14} aria-hidden /> Бригада и оплата
            </div>
            <div className="tc-workers">
              {settings.workers.map((worker) => (
                <div key={worker.id} className="tc-worker">
                  <div className="tc-worker-head">
                    <input
                      className="tc-worker-name"
                      value={worker.name}
                      onChange={(event) => updateWorker(worker.id, { name: event.target.value })}
                    />
                    {settings.workers.length > 1 ? (
                      <button
                        type="button"
                        className="tc-worker-remove"
                        aria-label="Убрать работника"
                        onClick={() => removeWorker(worker.id)}
                      >
                        <X size={16} aria-hidden />
                      </button>
                    ) : null}
                  </div>
                  <div className="tc-worker-pay">
                    <select
                      className="tc-select"
                      value={worker.type}
                      onChange={(event) =>
                        updateWorker(worker.id, { type: event.target.value as typeof worker.type })
                      }
                    >
                      {PAY_TYPES.map((pay) => (
                        <option key={pay.value} value={pay.value}>
                          {pay.label}
                        </option>
                      ))}
                    </select>
                    {worker.type !== "oklad" ? (
                      <span className="tc-field-control tc-worker-value">
                        <input
                          className="tc-field-input"
                          type="number"
                          inputMode="decimal"
                          value={worker.value}
                          onChange={(event) => updateWorker(worker.id, { value: event.target.value })}
                        />
                        <span className="tc-field-unit">{unitOf(worker.type)}</span>
                      </span>
                    ) : null}
                  </div>
                  {worker.type === "percent" ? (
                    <div className="tc-worker-base">
                      <span className="tc-muted-sm">процент от:</span>
                      <Segmented
                        value={worker.base}
                        onChange={(base) => updateWorker(worker.id, { base })}
                        options={[
                          { value: "margin", label: "маржи" },
                          { value: "revenue", label: "выручки" },
                        ]}
                      />
                    </div>
                  ) : null}
                  {worker.type === "oklad" ? (
                    <p className="tc-muted-sm tc-worker-note">
                      В окладе — рейс не добавляет затрат на этого человека.
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <button type="button" className="tc-add-link" onClick={addWorker}>
              <UserPlus size={14} aria-hidden /> Добавить человека
            </button>
          </div>

          <Field label="Название машины" type="text" value={veh.name} onChange={(value) => updateVehicle({ name: value })} />

          <div className="tc-group">
            <div className="tc-group-label">
              <Fuel size={14} aria-hidden /> Топливо
            </div>
            <div className="tc-fields">
              <Field label="Расход" unit="л/100км" value={veh.fuel} onChange={(value) => updateVehicle({ fuel: value })} />
              <Field label="Цена топлива" unit="₽/л" value={settings.fuelPrice} onChange={(value) => setField("fuelPrice", value)} />
            </div>
          </div>

          <div className="tc-group">
            <div className="tc-group-label">
              <Wrench size={14} aria-hidden /> Машина и время
            </div>
            <div className="tc-fields">
              <Field label="Амортизация" unit="₽/км" value={veh.deprec} onChange={(value) => updateVehicle({ deprec: value })} />
              <Field label="Средняя скорость" unit="км/ч" value={veh.speed} onChange={(value) => updateVehicle({ speed: value })} />
              <Field label="Время погрузки" unit="ч" value={settings.loadTime} onChange={(value) => setField("loadTime", value)} />
              <Field label="Прочее (платные дороги)" unit="₽" value={settings.otherCosts} onChange={(value) => setField("otherCosts", value)} />
            </div>
            <button type="button" className="tc-add-link" onClick={() => setShowAmort((value) => !value)}>
              <Calculator size={14} aria-hidden /> Посчитать амортизацию
              <ChevronDown size={14} aria-hidden className={`tc-chevron${showAmort ? " is-open" : ""}`} />
            </button>
            {showAmort ? (
              <div className="tc-amort">
                <p className="tc-muted-sm">Затраты на машину за год ÷ годовой пробег:</p>
                <div className="tc-fields">
                  <Field label="Ремонт и ТО за год" unit="₽" value={settings.amort.repair} onChange={(value) => updateAmort({ repair: value })} />
                  <Field label="Резина за год" unit="₽" value={settings.amort.tires} onChange={(value) => updateAmort({ tires: value })} />
                  <Field label="Откладываю на новую машину" unit="₽/год" value={settings.amort.replace} onChange={(value) => updateAmort({ replace: value })} />
                  <Field label="Пробег за год" unit="км" value={settings.amort.mileage} onChange={(value) => updateAmort({ mileage: value })} />
                </div>
                <button
                  type="button"
                  className="button tc-amort-apply"
                  onClick={() => {
                    updateVehicle({ deprec: amortValue.toFixed(1) });
                    setShowAmort(false);
                  }}
                >
                  Применить: {amortValue.toFixed(1)} ₽/км
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
