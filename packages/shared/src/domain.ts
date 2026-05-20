export const companyStatuses = [
  "demo",
  "active",
  "past_due",
  "suspended",
  "blocked",
  "archived",
] as const;

export type CompanyStatus = (typeof companyStatuses)[number];

export const subscriptionPlans = ["basic", "extended"] as const;

export type SubscriptionPlan = (typeof subscriptionPlans)[number];

export const platformRoles = ["admin", "moderator", "content_manager"] as const;

export type PlatformRole = (typeof platformRoles)[number];

export const contentStatuses = ["draft", "published"] as const;

export type ContentStatus = (typeof contentStatuses)[number];

export const learningAccessLevels = ["basic", "extended", "one_time"] as const;

export type LearningAccessLevel = (typeof learningAccessLevels)[number];

export const supportTicketStatuses = [
  "new",
  "in_progress",
  "awaiting_user",
  "resolved",
  "closed",
] as const;

export type SupportTicketStatus = (typeof supportTicketStatuses)[number];

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
  phone: string;
  companyId: string | null;
  platformRoles: PlatformRole[];
};

export type CompanyAccessSnapshot = {
  status: CompanyStatus;
  demoEndsAt: string | Date | null;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionEndsAt: string | Date | null;
};
