import type { CompanyAccessSnapshot, LearningAccessLevel, NewsAccessTier, PlatformRole } from "./domain";

export const DEMO_DURATION_HOURS = 24;
export const EDUCATION_COMPANY_TYPES: readonly CompanyAccessSnapshot["type"][] = ["collector"];

export function hasPlatformRole(roles: PlatformRole[], expected: PlatformRole): boolean {
  return roles.includes(expected);
}

export function hasAnyPlatformRole(roles: PlatformRole[], expected: PlatformRole[]): boolean {
  return expected.some((role) => roles.includes(role));
}

export function isDemoActive(company: Pick<CompanyAccessSnapshot, "status" | "demoEndsAt">, now = new Date()): boolean {
  if (company.status !== "demo" || !company.demoEndsAt) {
    return false;
  }

  return new Date(company.demoEndsAt).getTime() > now.getTime();
}

export function isSubscriptionActive(
  company: Pick<CompanyAccessSnapshot, "status" | "subscriptionEndsAt">,
  now = new Date(),
): boolean {
  if (company.status !== "active" && company.status !== "past_due") {
    return false;
  }

  if (!company.subscriptionEndsAt) {
    return false;
  }

  // `past_due` сам по себе НЕ продлевает доступ: компания сохраняет
  // функциональные разделы только пока подписка реально не истекла
  // (`subscriptionEndsAt` в будущем). После истечения hourly-cron переводит
  // компанию в `past_due`, и доступ закрывается — симметрично истёкшему demo.
  // Раньше здесь был `|| company.status === "past_due"`, из-за чего компания
  // с истёкшей платной подпиской сохраняла функциональный доступ бессрочно.
  return new Date(company.subscriptionEndsAt).getTime() > now.getTime();
}

export function canOpenFunctionalSections(company: CompanyAccessSnapshot, now = new Date()): boolean {
  return isDemoActive(company, now) || isSubscriptionActive(company, now);
}

export function effectivePlan(
  company: CompanyAccessSnapshot,
  now = new Date(),
): "demo_basic" | "basic" | "extended" | null {
  // Demo считается базовой подпиской, но мы возвращаем отдельное значение,
  // чтобы интерфейс мог честно показать пользователю, что доступ временный.
  if (isDemoActive(company, now)) {
    return "demo_basic";
  }

  if (!isSubscriptionActive(company, now)) {
    return null;
  }

  return company.subscriptionPlan;
}

export function canAccessBasicContent(company: CompanyAccessSnapshot, now = new Date()): boolean {
  return effectivePlan(company, now) !== null;
}

// Демо намеренно видит оба уровня новостей: это отдельное продуктовое правило,
// которое не расширяет доступ к обучению и другим возможностям тарифа.
export function canAccessNewsTier(
  company: CompanyAccessSnapshot,
  accessTier: NewsAccessTier,
  now = new Date(),
): boolean {
  const plan = effectivePlan(company, now);
  if (plan === "demo_basic") {
    return true;
  }
  if (accessTier === "basic") {
    return plan === "basic" || plan === "extended";
  }
  return plan === "extended";
}

export function canAccessLearningLevel(
  company: CompanyAccessSnapshot,
  accessLevel: LearningAccessLevel,
  hasOneTimePurchase = false,
  now = new Date(),
): boolean {
  const plan = effectivePlan(company, now);

  if (accessLevel === "one_time") {
    return (
      hasOneTimePurchase &&
      company.status !== "pending_deletion" &&
      company.status !== "blocked" &&
      company.status !== "archived"
    );
  }

  if (accessLevel === "basic") {
    return plan === "demo_basic" || plan === "basic" || plan === "extended";
  }

  return plan === "extended";
}

export function demoEndsAt(createdAt = new Date()): Date {
  return new Date(createdAt.getTime() + DEMO_DURATION_HOURS * 60 * 60 * 1000);
}

export function canAccessEducationSection(
  company: Pick<CompanyAccessSnapshot, "type"> | null | undefined,
  platformRoles: readonly PlatformRole[] = [],
): boolean {
  if (platformRoles.length > 0) {
    return true;
  }

  return Boolean(company && EDUCATION_COMPANY_TYPES.includes(company.type));
}
