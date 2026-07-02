import type { CompanyRole, CompanyType, SubscriptionPlan, UserStatus } from "./domain";

// Разделы, доступ к которым владелец компании может выдавать сотрудникам.
// `key` совпадает с NavItem.key в app-shell-nav (единый источник ключей).
// companyTypes/requiresMarketplace — доступен ли раздел самой компании (из этого
// набора владелец и выбирает подмножество для сотрудника).
export type MemberSection = {
  key: string;
  label: string;
  companyTypes?: readonly CompanyType[];
  requiresMarketplace?: boolean;
};

export const MEMBER_SECTIONS: readonly MemberSection[] = [
  { key: "news", label: "Новости" },
  { key: "indices", label: "Индексы цен" },
  { key: "forum", label: "Форум" },
  { key: "education", label: "Обучение", companyTypes: ["collector"] },
  { key: "knowledge-base", label: "Сырьё" },
  { key: "docs", label: "Документация" },
  { key: "calculator-retail", label: "Калькулятор", companyTypes: ["collector"] },
  { key: "marketplace", label: "Торговая площадка", requiresMarketplace: true },
];

const MEMBER_SECTION_KEYS = new Set(MEMBER_SECTIONS.map((section) => section.key));

export function isMemberSectionKey(value: string): boolean {
  return MEMBER_SECTION_KEYS.has(value);
}

// Разделы, доступные компании данного типа (с учётом фичи площадки). Из них
// владелец выбирает набор для сотрудника, и ими же ограничивается валидация.
export function availableMemberSections(companyType: CompanyType, marketplaceEnabled: boolean): MemberSection[] {
  return MEMBER_SECTIONS.filter((section) => {
    if (section.companyTypes && !section.companyTypes.includes(companyType)) return false;
    if (section.requiresMarketplace && !marketplaceEnabled) return false;
    return true;
  });
}

// Санитизация присланного владельцем набора: только валидные ключи, доступные
// компании, без дублей.
export function sanitizeMemberSections(
  requested: readonly string[],
  companyType: CompanyType,
  marketplaceEnabled: boolean,
): string[] {
  const allowed = new Set(availableMemberSections(companyType, marketplaceEnabled).map((section) => section.key));
  return Array.from(new Set(requested)).filter((key) => allowed.has(key));
}

// Базовая ежемесячная цена тарифа (₽). ИНФОРМАЦИОННО — платёжной системы пока
// нет; используется только для расчёта «+10% за каждого доп. сотрудника» в
// кабинете. Значения-плейсхолдеры, владелец скорректирует.
export const PLAN_BASE_PRICE_RUB: Record<SubscriptionPlan, number> = {
  basic: 9900,
  extended: 19900,
};

export const MEMBER_SURCHARGE_RATE = 0.1; // +10% от базы за каждого доп. сотрудника

export type CompanySeatPricing = {
  plan: SubscriptionPlan | null;
  base: number;
  surchargePerSeat: number;
  extraSeats: number;
  total: number;
};

// memberCount — ВСЕГО пользователей компании (владелец + сотрудники). Первый
// (владелец) наценки не добавляет; каждый следующий = +10% от базы.
export function computeSeatPricing(plan: SubscriptionPlan | null, memberCount: number): CompanySeatPricing {
  const base = plan ? PLAN_BASE_PRICE_RUB[plan] : 0;
  const extraSeats = Math.max(0, memberCount - 1);
  const surchargePerSeat = Math.round(base * MEMBER_SURCHARGE_RATE);
  return { plan, base, surchargePerSeat, extraSeats, total: base + surchargePerSeat * extraSeats };
}

// ── Ответы API кабинета «Сотрудники» ──────────────────────────────────────
export type CompanyMemberItem = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: CompanyRole;
  status: UserStatus;
  allowedSections: string[];
  createdAt: string;
};

export type CompanyInvitationStatusView = "pending" | "accepted" | "revoked" | "expired";

export type CompanyInvitationItem = {
  id: string;
  email: string;
  status: CompanyInvitationStatusView;
  allowedSections: string[];
  expiresAt: string;
  createdAt: string;
};

export type CompanyMembersView = {
  isOwner: boolean;
  members: CompanyMemberItem[];
  invitations: CompanyInvitationItem[];
  availableSections: MemberSection[];
  pricing: CompanySeatPricing;
};

// Публичная инфо о приглашении (страница принятия): email + название компании.
export type CompanyInvitationInfo = {
  email: string;
  companyName: string;
};
