import type { BillingStatus } from "@ecoplatform/shared";
import type { User } from "../../lib/auth";

export type ProfileCheckKey = "email" | "phone" | "payment" | "subscription";

export type ProfileCheck = {
  key: ProfileCheckKey;
  label: string;
  done: boolean;
  // Подсказка для невыполненного пункта в чек-листе кольца.
  hint?: string;
};

// Критерии заполненности профиля. Раньше жили внутри AccountProfileSection;
// вынесены, чтобы кольцо-чек-лист и празднование 100% считали одинаково.
export function buildProfileChecks(user: User | null, billing: BillingStatus | null): ProfileCheck[] {
  return [
    { key: "email", label: "Подтверждённая почта", done: Boolean(user?.email) },
    {
      key: "phone",
      label: "Указанный телефон",
      done: Boolean(user?.phone),
      hint: "Добавьте в карточке «Личные данные»",
    },
    { key: "payment", label: "Добавлен способ оплаты", done: false, hint: "Появится вместе с онлайн-оплатой" },
    {
      key: "subscription",
      label: "Активная подписка",
      done:
        billing?.status === "active" &&
        (billing?.subscriptionPlan === "basic" || billing?.subscriptionPlan === "extended"),
      hint: "Выберите тариф в «Подписке»",
    },
  ];
}

export function profileCompletionPercent(checks: ProfileCheck[]): number {
  if (checks.length === 0) return 0;
  return Math.round((checks.filter((check) => check.done).length / checks.length) * 100);
}
