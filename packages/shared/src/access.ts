import type { CompanyAccessSnapshot, LearningAccessLevel, PlatformRole } from "./domain";

export const DEMO_DURATION_HOURS = 24;

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

  return new Date(company.subscriptionEndsAt).getTime() > now.getTime() || company.status === "past_due";
}

export function canOpenFunctionalSections(company: CompanyAccessSnapshot, now = new Date()): boolean {
  return isDemoActive(company, now) || isSubscriptionActive(company, now);
}

export function effectivePlan(company: CompanyAccessSnapshot, now = new Date()): "demo_basic" | "basic" | "extended" | null {
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

export function canAccessLearningLevel(
  company: CompanyAccessSnapshot,
  accessLevel: LearningAccessLevel,
  hasOneTimePurchase = false,
  now = new Date(),
): boolean {
  const plan = effectivePlan(company, now);

  if (accessLevel === "one_time") {
    return hasOneTimePurchase && company.status !== "blocked" && company.status !== "archived";
  }

  if (accessLevel === "basic") {
    return plan === "demo_basic" || plan === "basic" || plan === "extended";
  }

  return plan === "extended";
}

export function demoEndsAt(createdAt = new Date()): Date {
  return new Date(createdAt.getTime() + DEMO_DURATION_HOURS * 60 * 60 * 1000);
}
