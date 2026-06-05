export type AccountSession = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  rememberMe: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  current: boolean;
};

export type NotificationPreferences = {
  inAppMutedCategories: string[];
  emailMutedCategories: string[];
};

export type CompanyFormState = {
  organizationName: string;
  websiteUrl: string;
  corporatePhone: string;
  corporateEmail: string;
};

export type CompanyEditableField = keyof CompanyFormState;
