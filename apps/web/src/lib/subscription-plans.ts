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
    name: "Пробный доступ",
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
    price: null,
    accent: "brand",
    badge: "Рекомендуем",
    features: [
      { label: "Всё из Демо, без ограничений", included: true },
      { label: "Торговая площадка", included: true },
      { label: "Приоритетная поддержка", included: true },
      { label: "Без расширенной аналитики", included: false },
    ],
  },
  {
    key: "extended",
    name: "Расширенная",
    description: "Максимум возможностей для крупных игроков.",
    price: null,
    accent: "green",
    features: [
      { label: "Всё из Базовой", included: true },
      { label: "Расширенная аналитика", included: true },
      { label: "Калькуляторы и карты", included: true },
      { label: "Персональный менеджер", included: true },
    ],
  },
];

export const PAID_SUBSCRIPTION_PLAN_TIERS = SUBSCRIPTION_PLAN_TIERS.filter(
  (tier): tier is PaidSubscriptionPlanTier => tier.key === "basic" || tier.key === "extended",
);
