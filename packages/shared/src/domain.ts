export const companyStatuses = [
  "demo",
  "active",
  "past_due",
  "suspended",
  "pending_deletion",
  "blocked",
  "archived",
] as const;

export type CompanyStatus = (typeof companyStatuses)[number];

export const subscriptionPlans = ["basic", "extended"] as const;

export type SubscriptionPlan = (typeof subscriptionPlans)[number];

export const companyTypes = ["collector", "trader", "processor"] as const;

export type CompanyType = (typeof companyTypes)[number];

export const userGenders = ["male", "female"] as const;

export type UserGender = (typeof userGenders)[number];

export const userStatuses = ["active", "blocked"] as const;

export type UserStatus = (typeof userStatuses)[number];

export const platformRoles = ["admin", "moderator", "content_manager"] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const contentStatuses = ["draft", "published"] as const;

export type ContentStatus = (typeof contentStatuses)[number];

export const learningAccessLevels = ["basic", "extended", "one_time"] as const;

export type LearningAccessLevel = (typeof learningAccessLevels)[number];

export const supportTicketStatuses = ["new", "in_progress", "awaiting_user", "resolved", "closed"] as const;

export type SupportTicketStatus = (typeof supportTicketStatuses)[number];

export const legalDocumentTypes = [
  "privacy_policy",
  "terms_of_service",
  "personal_data_consent",
  "cookie_policy",
  "marketing_consent",
  "offer_agreement",
] as const;

export type LegalDocumentType = (typeof legalDocumentTypes)[number];

export const consentSources = ["registration", "login_reconfirm", "cookie_banner", "settings", "admin_action"] as const;

export type ConsentSource = (typeof consentSources)[number];

export const supportTicketCategories = [
  "billing",
  "moderation_review",
  "company_management",
  "technical",
  "data_deletion",
  "other",
] as const;

export type SupportTicketCategory = (typeof supportTicketCategories)[number];

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  gender: UserGender;
  avatarUrl: string | null;
  phone: string;
  companyId: string | null;
  platformRoles: PlatformRole[];
};

export type CompanyAccessSnapshot = {
  type: CompanyType;
  status: CompanyStatus;
  demoEndsAt: string | Date | null;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionEndsAt: string | Date | null;
};

// ── Торговая площадка ──────────────────────────────────────────────────────
// Статус объявления о продаже сырья. `draft` — черновик, `active` —
// опубликовано (идёт 14-дневный отсчёт), `archived` — снято/продано/истекло.
export const listingStatuses = ["draft", "active", "archived"] as const;

export type ListingStatus = (typeof listingStatuses)[number];

// Форма поставки позиции: прессованные тюки или несортированная россыпь.
export const listingPositionForms = ["pressed", "loose"] as const;

export type ListingPositionForm = (typeof listingPositionForms)[number];

// Предложения (фаза 3): статус, условие цены, итог сделки.
export const offerStatuses = ["active", "withdrawn", "accepted", "declined"] as const;

export type OfferStatus = (typeof offerStatuses)[number];

export const priceConditions = ["from_place", "at_gate"] as const;

export type PriceCondition = (typeof priceConditions)[number];

export const dealResults = ["agreed", "not_agreed"] as const;

export type DealResult = (typeof dealResults)[number];

// Отзывы (фаза 4): направление, статус, критерии. Критерии РАЗНЫЕ по
// направлению (решение владельца) — см. REVIEW_CRITERIA_BY_DIRECTION.
export const reviewDirections = ["buyer_to_seller", "seller_to_buyer"] as const;

export type ReviewDirection = (typeof reviewDirections)[number];

export const reviewStatuses = ["published", "hidden_by_moderator", "removed_by_author"] as const;

export type ReviewStatus = (typeof reviewStatuses)[number];

export const reviewCriteria = [
  "quality",
  "weight_accuracy",
  "shipping_speed",
  "payment_speed",
  "terms_adherence",
  "reliability",
] as const;

export type ReviewCriterion = (typeof reviewCriteria)[number];

// Покупатель оценивает продавца по одним осям, продавец покупателя — по другим.
export const REVIEW_CRITERIA_BY_DIRECTION: Record<ReviewDirection, readonly ReviewCriterion[]> = {
  buyer_to_seller: ["quality", "weight_accuracy", "shipping_speed", "reliability"],
  seller_to_buyer: ["payment_speed", "terms_adherence", "reliability"],
};

// Критерии, по которым оценивается компания данного типа (что она получает):
// заготовитель — как продавец, трейдер/переработчик — как покупатель.
export function reviewCriteriaForCompanyType(type: CompanyType): readonly ReviewCriterion[] {
  return type === "collector"
    ? REVIEW_CRITERIA_BY_DIRECTION.buyer_to_seller
    : REVIEW_CRITERIA_BY_DIRECTION.seller_to_buyer;
}
