import { z } from "zod";

// Контракт сохранённых настроек розничного калькулятора рейса. Хранится одним
// JSON-блоком на компанию-заготовителя (CompanyTripCalculatorSettings.data) и
// валидируется этой схемой на границе HTTP (api) и при гидрации на клиенте (web).
//
// Числовые поля держим СТРОКАМИ — ровно так, как они живут в редактируемых
// полях формы (пользователь может стереть значение или печатать «12,»). Само
// вычисление приводит их к числам через num() в trip-economics. Поэтому здесь
// валидация структурная (правильные ключи/типы/границы массивов), а не числовая
// чистота — чтобы автосохранение никогда не падало на промежуточном вводе.

export const tripCalcPayTypes = ["hour", "trip", "percent", "perTon", "oklad"] as const;
export type TripCalcPayType = (typeof tripCalcPayTypes)[number];

export const tripCalcPercentBases = ["margin", "revenue"] as const;
export type TripCalcPercentBase = (typeof tripCalcPercentBases)[number];

const numericField = z.string().max(20);
const nameField = z.string().trim().max(80);
const idField = z.string().min(1).max(40);

export const tripCalcVehicleSchema = z.object({
  id: idField,
  name: nameField,
  fuel: numericField, // л/100км
  deprec: numericField, // ₽/км
  speed: numericField, // км/ч
});
export type TripCalcVehicle = z.infer<typeof tripCalcVehicleSchema>;

export const tripCalcWorkerSchema = z.object({
  id: idField,
  name: nameField,
  type: z.enum(tripCalcPayTypes),
  value: numericField,
  base: z.enum(tripCalcPercentBases),
});
export type TripCalcWorker = z.infer<typeof tripCalcWorkerSchema>;

// Цены сырья — индивидуальные ориентиры заготовителя по категориям (slug из
// materials.ts: makulatura/plenki/plastiki/default). Массив, а не record —
// проще валидировать и не привязываться к фиксированным ключам.
export const tripCalcMaterialPriceSchema = z.object({
  slug: idField,
  buy: numericField, // ₽/кг
  sell: numericField, // ₽/кг
});
export type TripCalcMaterialPrice = z.infer<typeof tripCalcMaterialPriceSchema>;

// Помощник амортизации: затраты на машину за год ÷ годовой пробег.
export const tripCalcAmortSchema = z.object({
  repair: numericField,
  tires: numericField,
  replace: numericField,
  mileage: numericField,
});
export type TripCalcAmort = z.infer<typeof tripCalcAmortSchema>;

export const tripCalculatorSettingsSchema = z.object({
  version: z.literal(1).default(1),
  vehicles: z.array(tripCalcVehicleSchema).min(1).max(20),
  selectedVehicleId: idField.optional(),
  workers: z.array(tripCalcWorkerSchema).min(1).max(20),
  fuelPrice: numericField, // ₽/л
  loadTime: numericField, // ч
  otherCosts: numericField, // ₽
  materialPrices: z.array(tripCalcMaterialPriceSchema).max(20),
  amort: tripCalcAmortSchema,
});
export type TripCalculatorSettings = z.infer<typeof tripCalculatorSettingsSchema>;

// GET /trip-calculator/settings отдаёт обёртку { settings }: внутри null, если
// компания ещё ничего не настраивала (клиент подставит дефолты). Обёртка нужна,
// чтобы тело ответа оставалось валидным JSON и в «пустом» случае — иначе Nest
// сериализует голый null пустой строкой, и response.json() на клиенте падает.
export type TripCalculatorSettingsGetResponse = { settings: TripCalculatorSettings | null };
