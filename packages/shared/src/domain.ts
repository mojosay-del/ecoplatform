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
