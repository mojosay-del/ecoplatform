// Экономика рейса за вторсырьём — чистое ядро калькулятора «Ехать за заявкой?».
// Никакого UI/React: только расчёт по предельной выгоде рейса (маржа с сырья
// минус расходы на дорогу туда-обратно). Постоянные расходы бизнеса (аренда и
// т.п.) сознательно НЕ учитываются. Покрыто trip-economics.test.ts — при правках
// сверять именно с этими формулами.

export type PayType = "hour" | "trip" | "percent" | "perTon" | "oklad";
export type PercentBase = "margin" | "revenue";

// Один человек бригады с произвольной схемой оплаты. Роли «водитель/грузчик» НЕ
// зашиты: водитель, который сам грузит, — это просто один работник.
export type WorkerInput = {
  name?: string;
  type: PayType;
  value: number;
  base?: PercentBase;
};

export type TripContext = {
  buyPrice: number; // ₽/кг закупка
  sellPrice: number; // ₽/кг продажа
  fuelConsumption: number; // л/100км
  deprec: number; // ₽/км амортизация
  speed: number; // км/ч (внутри ограничим снизу единицей)
  fuelPrice: number; // ₽/л
  loadTime: number; // ч на погрузку
  otherCosts: number; // ₽ прочее (платные дороги и т.п.)
  workers: WorkerInput[];
};

export type WorkerCost = { name: string; cost: number };

export type TripResult = {
  roundTrip: number;
  totalTime: number;
  unitMargin: number;
  margin: number;
  revenue: number;
  fuel: number;
  deprec: number;
  other: number;
  perWorker: WorkerCost[];
  labor: number;
  trip: number;
  profit: number;
};

export type TripSummary = TripResult & {
  profitPerHour: number;
  beD: number | null;
  beW: number | null;
};

// Парсинг пользовательского ввода: запятая→точка, нечисло/пусто → 0.
export function num(value: unknown): number {
  const parsed = parseFloat(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Предельная экономика рейса при заданных плече (в одну сторону) и весе.
export function profitAt(distance: number, weight: number, ctx: TripContext): TripResult {
  const speed = Math.max(ctx.speed, 1);
  const roundTrip = distance * 2;
  const totalTime = roundTrip / speed + ctx.loadTime;
  const unitMargin = ctx.sellPrice - ctx.buyPrice;
  const margin = unitMargin * weight;
  const revenue = ctx.sellPrice * weight;
  const fuel = ((roundTrip * ctx.fuelConsumption) / 100) * ctx.fuelPrice;
  const deprec = roundTrip * ctx.deprec;

  const perWorker = ctx.workers.map((worker) => {
    let cost = 0;
    if (worker.type === "hour") cost = worker.value * totalTime;
    else if (worker.type === "trip") cost = worker.value;
    else if (worker.type === "percent")
      cost = Math.max(0, (worker.value / 100) * (worker.base === "revenue" ? revenue : margin));
    else if (worker.type === "perTon") cost = (worker.value * weight) / 1000;
    // oklad: рейс не добавляет предельных затрат на этого человека → 0.
    return { name: worker.name ?? "", cost };
  });

  const labor = perWorker.reduce((sum, item) => sum + item.cost, 0);
  const trip = fuel + deprec + ctx.otherCosts + labor;

  return {
    roundTrip,
    totalTime,
    unitMargin,
    margin,
    revenue,
    fuel,
    deprec,
    other: ctx.otherCosts,
    perWorker,
    labor,
    trip,
    profit: margin - trip,
  };
}

// Максимальное плечо (км в одну сторону) при фиксированных весе и ценах.
// Считаем ЧИСЛЕННО (удвоение + бинарный поиск), чтобы было верно при любых
// схемах оплаты — percent/perTon делают аналитические формулы хрупкими.
export function breakEvenDistance(ctx: TripContext, weight: number): number | null {
  // Даже нулевое плечо убыточно — ехать некуда.
  if (profitAt(0, weight, ctx).profit <= 0) return null;

  let hi = 1;
  let found = false;
  for (let i = 0; i < 40 && hi <= 2e6; i++) {
    if (profitAt(hi, weight, ctx).profit <= 0) {
      found = true;
      break;
    }
    hi *= 2;
  }
  // Прибыль не уходит в минус в разумном диапазоне (расстояние не влияет) → «—».
  if (!found) return null;

  let lo = 0;
  let high = hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + high) / 2;
    if (profitAt(mid, weight, ctx).profit > 0) lo = mid;
    else high = mid;
  }
  return (lo + high) / 2;
}

// Минимальный объём (кг) при фиксированном расстоянии.
export function breakEvenWeight(ctx: TripContext, distance: number): number | null {
  // Уже выгодно при нулевом весе (например, фикс за рейс и хорошая ставка) → 0.
  if (profitAt(distance, 0, ctx).profit >= 0) return 0;

  let hi = 1;
  let found = false;
  for (let i = 0; i < 50 && hi <= 1e8; i++) {
    if (profitAt(distance, hi, ctx).profit >= 0) {
      found = true;
      break;
    }
    hi *= 2;
  }
  // Экономика на кг неположительна (процент/перетонна съедают маржу) → «—».
  if (!found) return null;

  let lo = 0;
  let high = hi;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + high) / 2;
    if (profitAt(distance, mid, ctx).profit < 0) lo = mid;
    else high = mid;
  }
  return (lo + high) / 2;
}

// Полный расчёт для экрана: основной рейс + производные показатели.
export function computeTrip(ctx: TripContext, distance: number, weight: number): TripSummary {
  const main = profitAt(distance, weight, ctx);
  const profitPerHour = main.totalTime > 0 ? main.profit / main.totalTime : 0;
  return {
    ...main,
    profitPerHour,
    beD: breakEvenDistance(ctx, weight),
    beW: breakEvenWeight(ctx, distance),
  };
}
