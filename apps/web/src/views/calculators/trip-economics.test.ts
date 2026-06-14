import { describe, expect, it } from "vitest";
import {
  breakEvenDistance,
  breakEvenWeight,
  computeTrip,
  num,
  profitAt,
  type TripContext,
  type WorkerInput,
} from "./trip-economics";

// Базовый контекст = дефолты прототипа: Газель, макулатура 7/12, один водитель
// на 300 ₽/час. Заявка 40 км / 500 кг даёт «ехать выгодно».
function ctx(overrides: Partial<TripContext> = {}): TripContext {
  return {
    buyPrice: 7,
    sellPrice: 12,
    fuelConsumption: 15,
    deprec: 8,
    speed: 50,
    fuelPrice: 60,
    loadTime: 0.5,
    otherCosts: 0,
    workers: [{ name: "Водитель (он же грузчик)", type: "hour", value: 300, base: "margin" }],
    ...overrides,
  };
}

const worker = (w: Partial<WorkerInput> & Pick<WorkerInput, "type">): WorkerInput => ({
  name: "Работник",
  value: 0,
  base: "margin",
  ...w,
});

describe("num", () => {
  it("парсит запятую как точку, пустое/мусор → 0", () => {
    expect(num("12,5")).toBe(12.5);
    expect(num("40")).toBe(40);
    expect(num("")).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(undefined)).toBe(0);
  });
});

describe("profitAt — базовая заявка (водитель он же грузчик)", () => {
  it("считает маржу, статьи и прибыль рейса", () => {
    const r = profitAt(40, 500, ctx());
    expect(r.unitMargin).toBe(5);
    expect(r.margin).toBe(2500);
    expect(r.revenue).toBe(6000);
    expect(r.roundTrip).toBe(80);
    expect(r.totalTime).toBeCloseTo(2.1, 5); // 80/50 + 0.5
    expect(r.fuel).toBeCloseTo(720, 5); // 80 * 15/100 * 60
    expect(r.deprec).toBe(640); // 80 * 8
    expect(r.labor).toBeCloseTo(630, 5); // 300 * 2.1
    expect(r.trip).toBeCloseTo(1990, 5);
    expect(r.profit).toBeCloseTo(510, 5);
  });
});

describe("crew: схемы оплаты", () => {
  it("oklad не добавляет затрат рейса (стоимость 0)", () => {
    const r = profitAt(40, 500, ctx({ workers: [worker({ type: "oklad", value: 99999 })] }));
    expect(r.perWorker[0]?.cost).toBe(0);
    expect(r.labor).toBe(0);
  });

  it("trip = фикс за рейс, не зависит от веса/времени", () => {
    const r = profitAt(40, 500, ctx({ workers: [worker({ type: "trip", value: 800 })] }));
    expect(r.perWorker[0]?.cost).toBe(800);
  });

  it("percent от маржи и от выручки считаются от разных баз", () => {
    const fromMargin = profitAt(40, 500, ctx({ workers: [worker({ type: "percent", value: 10, base: "margin" })] }));
    const fromRevenue = profitAt(40, 500, ctx({ workers: [worker({ type: "percent", value: 10, base: "revenue" })] }));
    expect(fromMargin.perWorker[0]?.cost).toBeCloseTo(250, 5); // 10% от 2500
    expect(fromRevenue.perWorker[0]?.cost).toBeCloseTo(600, 5); // 10% от 6000
  });

  it("percent не может быть отрицательным при убыточной марже (clamp ≥ 0)", () => {
    const r = profitAt(40, 500, ctx({ buyPrice: 12, sellPrice: 7, workers: [worker({ type: "percent", value: 10 })] }));
    expect(r.perWorker[0]?.cost).toBe(0);
  });

  it("perTon = ставка × вес / 1000", () => {
    const r = profitAt(40, 2000, ctx({ workers: [worker({ type: "perTon", value: 500 })] }));
    expect(r.perWorker[0]?.cost).toBeCloseTo(1000, 5); // 500 ₽/т × 2 т
  });

  it("комбинация почасового и процентного работников складывается", () => {
    const r = profitAt(
      40,
      500,
      ctx({
        workers: [
          worker({ type: "hour", value: 300 }),
          worker({ type: "percent", value: 10, base: "margin" }),
        ],
      }),
    );
    expect(r.perWorker[0]?.cost).toBeCloseTo(630, 5);
    expect(r.perWorker[1]?.cost).toBeCloseTo(250, 5);
    expect(r.labor).toBeCloseTo(880, 5);
  });
});

describe("крайние случаи маржи", () => {
  it("unitMargin <= 0: продажа не выше закупки → маржа и прибыль отрицательны", () => {
    const r = profitAt(40, 500, ctx({ buyPrice: 12, sellPrice: 12 }));
    expect(r.unitMargin).toBe(0);
    expect(r.margin).toBe(0);
    expect(r.profit).toBeLessThan(0);
  });
});

describe("breakEvenDistance (макс. плечо)", () => {
  it("находит конечное положительное плечо при выгодной экономике", () => {
    const beD = breakEvenDistance(ctx(), 500);
    expect(beD).not.toBeNull();
    expect(beD as number).toBeGreaterThan(40); // на 40 км ещё выгодно
    // На безубыточном плече прибыль ≈ 0.
    expect(profitAt(beD as number, 500, ctx()).profit).toBeCloseTo(0, 2);
  });

  it("beD = null, когда даже при нулевом плече убыточно", () => {
    // Дорогой почасовик: оплата за время погрузки уже съедает маржу при D=0.
    const c = ctx({ workers: [worker({ type: "hour", value: 6000 })] });
    expect(profitAt(0, 500, c).profit).toBeLessThan(0);
    expect(breakEvenDistance(c, 500)).toBeNull();
  });
});

describe("breakEvenWeight (мин. объём)", () => {
  it("находит минимальный вес, окупающий расстояние", () => {
    const beW = breakEvenWeight(ctx(), 40);
    expect(beW).not.toBeNull();
    expect(beW as number).toBeGreaterThan(0);
    expect(beW as number).toBeLessThan(500); // 500 кг уже прибыльны
    expect(profitAt(40, beW as number, ctx()).profit).toBeCloseTo(0, 1);
  });

  it("beW = 0, когда рейс выгоден уже при нулевом весе (фикс за рейс не нужен)", () => {
    // Нет дорожных затрат, фикс-доход не зависящий от веса не моделируем — но
    // при нулевых расходах рейса прибыль при W=0 равна 0 → порог 0.
    const beW = breakEvenWeight(ctx({ fuelConsumption: 0, deprec: 0, otherCosts: 0, loadTime: 0, workers: [] }), 40);
    expect(beW).toBe(0);
  });

  it("beW = null, когда экономика на кг неположительна (процент съедает маржу)", () => {
    // Процент от выручки > удельной маржи: каждый кг увеличивает убыток.
    const c = ctx({ workers: [worker({ type: "percent", value: 80, base: "revenue" })] });
    expect(breakEvenWeight(c, 40)).toBeNull();
  });
});

describe("computeTrip — сводка для экрана", () => {
  it("добавляет profitPerHour и пороги", () => {
    const s = computeTrip(ctx(), 40, 500);
    expect(s.profit).toBeCloseTo(510, 5);
    expect(s.profitPerHour).toBeCloseTo(510 / 2.1, 4);
    expect(s.beD).not.toBeNull();
    expect(s.beW).not.toBeNull();
  });
});
