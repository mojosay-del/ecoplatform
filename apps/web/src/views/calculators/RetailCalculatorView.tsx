"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Clock, Coins, Plus, Route, TrendingDown, TrendingUp, Truck, Weight, X } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { AccessClosed, AuthRequired } from "../shared";
import { MATERIAL_LEGEND } from "../marketplace/materials";
import { Field } from "./Field";
import { SettingsPanel } from "./SettingsPanel";
import { genId } from "./defaults";
import { hours, kg, km, rub, signedRub } from "./format";
import { computeTrip, num, type TripContext } from "./trip-economics";
import { useTripCalculatorSettings } from "./use-trip-calculator-settings";
import { removeVehiclePreset } from "./vehicle-presets";

// Цвета сегментов диаграммы расходов: топливо — янтарь, работники — палитра,
// амортизация — красный, прочее — серый (на токенах).
const WORKER_COLORS = [
  "var(--info)",
  "var(--brand)",
  "var(--logo-green)",
  "var(--warning-strong)",
  "var(--material-makulatura)",
];

export function RetailCalculatorView() {
  const { settings, update, state } = useTripCalculatorSettings();

  // Транзиентные поля заявки — не сохраняются (это «текущий рейс», а не профиль).
  const [material, setMaterial] = useState<string>(() => MATERIAL_LEGEND[0]?.slug ?? "default");
  const [weight, setWeight] = useState("500");
  const [distance, setDistance] = useState("40");

  const vehicleId = settings.selectedVehicleId ?? settings.vehicles[0]?.id ?? "";
  const veh = settings.vehicles.find((vehicle) => vehicle.id === vehicleId) ?? settings.vehicles[0];
  const matPrice = settings.materialPrices.find((price) => price.slug === material) ?? {
    slug: material,
    buy: "0",
    sell: "0",
  };

  const result = useMemo(() => {
    const ctx: TripContext = {
      buyPrice: num(matPrice.buy),
      sellPrice: num(matPrice.sell),
      fuelConsumption: num(veh?.fuel),
      deprec: num(veh?.deprec),
      speed: num(veh?.speed),
      fuelPrice: num(settings.fuelPrice),
      loadTime: num(settings.loadTime),
      otherCosts: num(settings.otherCosts),
      workers: settings.workers.map((worker) => ({
        name: worker.name,
        type: worker.type,
        value: num(worker.value),
        base: worker.base,
      })),
    };
    return computeTrip(ctx, num(distance), num(weight));
  }, [
    matPrice.buy,
    matPrice.sell,
    veh,
    settings.fuelPrice,
    settings.loadTime,
    settings.otherCosts,
    settings.workers,
    distance,
    weight,
  ]);

  if (state === "unauthenticated") {
    return <AuthRequired title="Калькулятор рейса" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="Калькулятор рейса" />;
  }

  const good = result.profit > 0;

  const selectVehicle = (id: string) => update((prev) => ({ ...prev, selectedVehicleId: id }));
  const addVehicle = () => {
    const id = genId("veh");
    update((prev) => ({
      ...prev,
      selectedVehicleId: id,
      vehicles: [
        ...prev.vehicles,
        { id, name: `Машина ${prev.vehicles.length + 1}`, fuel: "15", deprec: "8", speed: "50" },
      ],
    }));
  };
  const removeVehicle = (id: string) => update((prev) => removeVehiclePreset(prev, id));

  const setMatPrice = (field: "buy" | "sell", value: string) =>
    update((prev) => {
      const exists = prev.materialPrices.some((price) => price.slug === material);
      const materialPrices = exists
        ? prev.materialPrices.map((price) => (price.slug === material ? { ...price, [field]: value } : price))
        : [...prev.materialPrices, { slug: material, buy: "0", sell: "0", [field]: value }];
      return { ...prev, materialPrices };
    });

  const breakdown = [
    { label: "Топливо", value: result.fuel, color: "var(--warning)" },
    ...result.perWorker.map((worker, index) => ({
      label: worker.name || "Работник",
      value: worker.cost,
      color: WORKER_COLORS[index % WORKER_COLORS.length],
    })),
    { label: "Амортизация", value: result.deprec, color: "var(--danger)" },
    { label: "Прочее", value: result.other, color: "var(--neutral)" },
  ].filter((item) => item.value > 0);

  return (
    <AppShell>
      <section className="page tc-page">
        <div className="tc-shell">
          <header className="tc-head">
            <span className="tc-head-icon" aria-hidden>
              <Truck size={20} />
            </span>
            <div>
              <h1 className="tc-head-title">Ехать за заявкой?</h1>
              <p className="tc-head-sub">Расчёт выгоды рейса за вторсырьём</p>
            </div>
          </header>

          <div className="tc-vehicle-chips" role="list" aria-label="Пресеты машин">
            {settings.vehicles.map((vehicle) => (
              <span
                key={vehicle.id}
                className={`tc-vehicle-pill${vehicle.id === vehicleId ? " is-active" : ""}`}
                role="listitem"
              >
                <button type="button" className="tc-vehicle-chip" onClick={() => selectVehicle(vehicle.id)}>
                  {vehicle.name}
                </button>
                {settings.vehicles.length > 1 ? (
                  <button
                    type="button"
                    className="tc-vehicle-remove"
                    aria-label={`Удалить пресет ${vehicle.name}`}
                    onClick={() => removeVehicle(vehicle.id)}
                  >
                    <X size={14} aria-hidden />
                  </button>
                ) : null}
              </span>
            ))}
            <button type="button" className="tc-vehicle-add" aria-label="Добавить машину" onClick={addVehicle}>
              <Plus size={16} aria-hidden />
            </button>
          </div>

          <div className="tc-main-grid">
            <div className="tc-primary-stack">
              <div className={`tc-verdict${good ? " is-good" : " is-bad"}`}>
                <div className="tc-verdict-tag">
                  {good ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}
                  {good ? "Ехать выгодно" : "Ехать невыгодно"}
                </div>
                <div className="tc-verdict-amount">{signedRub(result.profit)}</div>
                <div className="tc-verdict-sub">
                  прибыль с рейса · {rub(result.profitPerHour)}/час
                  {result.roundTrip ? ` · ${km(result.roundTrip)} туда-обратно` : ""}
                </div>
              </div>

              <div className="tc-stats">
                <div className="tc-stat">
                  <div className="tc-stat-label">
                    <Route size={14} aria-hidden /> макс. плечо
                  </div>
                  <div className="tc-stat-value">{result.beD && result.beD > 0 ? km(result.beD) : "—"}</div>
                  <div className="tc-stat-hint">в одну сторону при этом весе</div>
                </div>
                <div className="tc-stat">
                  <div className="tc-stat-label">
                    <Weight size={14} aria-hidden /> мин. объём
                  </div>
                  <div className="tc-stat-value">{result.beW != null && result.beW > 0 ? kg(result.beW) : "—"}</div>
                  <div className="tc-stat-hint">чтобы окупить это расстояние</div>
                </div>
              </div>

              {result.unitMargin <= 0 ? (
                <div className="tc-warn">
                  На этом сырье вы теряете на каждом килограмме: цена продажи не выше закупки. Рейс не окупится ни при
                  каком объёме.
                </div>
              ) : null}

              <section className="tc-card">
                <h2 className="tc-card-title">Заявка</h2>
                <div className="tc-material-chips">
                  {MATERIAL_LEGEND.map((item) => (
                    <button
                      key={item.slug}
                      type="button"
                      className={`tc-material-chip${material === item.slug ? " is-active" : ""}`}
                      style={{ "--mat-color": item.color } as CSSProperties}
                      onClick={() => setMaterial(item.slug)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="tc-fields">
                  <Field label="Вес" unit="кг" value={weight} onChange={setWeight} />
                  <Field label="Расстояние (в 1 сторону)" unit="км" value={distance} onChange={setDistance} />
                  <Field
                    label="Цена закупки"
                    unit="₽/кг"
                    value={matPrice.buy}
                    onChange={(value) => setMatPrice("buy", value)}
                  />
                  <Field
                    label="Цена продажи"
                    unit="₽/кг"
                    value={matPrice.sell}
                    onChange={(value) => setMatPrice("sell", value)}
                  />
                </div>
                <div className="tc-margin-row">
                  <span className="tc-margin-label">
                    <Coins size={16} aria-hidden /> Маржа с сырья
                  </span>
                  <span className="tc-margin-value">{rub(result.margin)}</span>
                </div>
              </section>
            </div>

            <div className="tc-side-stack">
              <section className="tc-card">
                <div className="tc-card-head">
                  <h2 className="tc-card-title">Расходы на рейс</h2>
                  <span className="tc-card-total">{rub(result.trip)}</span>
                </div>
                {result.trip > 0 ? (
                  <div className="tc-bar">
                    {breakdown.map((item) => (
                      <span
                        key={item.label}
                        className="tc-bar-seg"
                        style={{ width: `${(item.value / result.trip) * 100}%`, background: item.color }}
                      />
                    ))}
                  </div>
                ) : null}
                <ul className="tc-breakdown">
                  {breakdown.map((item) => (
                    <li key={item.label} className="tc-breakdown-row">
                      <span className="tc-breakdown-label">
                        <span className="tc-dot" style={{ background: item.color }} /> {item.label}
                      </span>
                      <span className="tc-breakdown-value">{rub(item.value)}</span>
                    </li>
                  ))}
                  <li className="tc-breakdown-row tc-breakdown-time">
                    <span>
                      <Clock size={12} aria-hidden /> Время в работе
                    </span>
                    <span>{hours(result.totalTime)}</span>
                  </li>
                </ul>
              </section>
            </div>
          </div>

          <SettingsPanel settings={settings} update={update} vehicleId={vehicleId} />

          <p className="tc-footnote">
            Цены и ставки — ориентиры, замените на свои. Расчёт по предельной выгоде рейса: маржа с сырья минус расходы
            на дорогу туда-обратно.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
