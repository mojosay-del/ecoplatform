import type { SubscriptionPlan } from "@ecoplatform/shared";

export type SubscriptionPlanTier = {
  key: "demo" | SubscriptionPlan;
  name: string;
  description: string;
  price: string | null;
  pricePeriod?: string;
  features: Array<{ label: string; included: boolean }>;
  accent: "brand" | "green";
  badge?: string;
};

export type PaidSubscriptionPlanTier = SubscriptionPlanTier & { key: SubscriptionPlan };

export const SUBSCRIPTION_PLAN_TIERS: SubscriptionPlanTier[] = [
  {
    key: "demo",
    name: "Пробный",
    description: "Один день, чтобы спокойно осмотреть платформу перед выбором тарифа.",
    price: "0 ₽",
    pricePeriod: "/ 24 часа",
    accent: "green",
    features: [
      { label: "Доступ к рабочим разделам на 24 часа", included: true },
      { label: "Индексы цен и новости", included: true },
      { label: "Базы знаний и обучение", included: true },
      { label: "Доступен только один раз", included: false },
    ],
  },
  {
    key: "basic",
    name: "Базовая",
    description: "Для постоянной работы на рынке вторсырья.",
    price: "0 ₽",
    pricePeriod: "/ месяц",
    accent: "brand",
    badge: "Рекомендуем",
    features: [
      { label: "Рабочие разделы платформы", included: true },
      { label: "Новости и индексы цен", included: true },
      { label: "Базовые обучающие модули", included: true },
      { label: "Без карт аналитики", included: false },
      { label: "Без расширенной истории", included: false },
    ],
  },
  {
    key: "extended",
    name: "Расширенная",
    description: "Максимум возможностей для крупных игроков.",
    price: "0 ₽",
    pricePeriod: "/ месяц",
    accent: "green",
    features: [
      { label: "Больше обучающих модулей", included: true },
      { label: "Карта аналитики", included: true },
      { label: "Дополнительные инструменты", included: true },
      { label: "Особые новости рынка", included: true },
      { label: "Длинная история индексов", included: true },
      { label: "Карта участников", included: true },
    ],
  },
];

export const PAID_SUBSCRIPTION_PLAN_TIERS = SUBSCRIPTION_PLAN_TIERS.filter(
  (tier): tier is PaidSubscriptionPlanTier => tier.key === "basic" || tier.key === "extended",
);
