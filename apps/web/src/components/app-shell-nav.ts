import { EDUCATION_COMPANY_TYPES, type AuthMeFeatures, type CompanyType } from "@ecoplatform/shared";
import type { LucideIcon } from "lucide-react";

export type NavIconKey =
  | "admin"
  | "analytics-map"
  | "back"
  | "calculator"
  | "data-privacy"
  | "docs"
  | "education"
  | "employees"
  | "forum"
  | "indices"
  | "knowledge"
  | "logout"
  | "map"
  | "marketplace"
  | "news"
  | "notifications"
  | "profile"
  | "sales-prices"
  | "sessions"
  | "settings"
  | "subscription";

export type NavItem = {
  // Стабильный ключ пункта app-меню; у account-меню не нужен.
  key?: string;
  href?: string;
  label: string;
  icon: NavIconKey;
  activePathPrefixes?: string[];
  disabled?: boolean;
  disabledHint?: string;
  roles?: string[];
  companyTypes?: readonly CompanyType[];
  feature?: keyof AuthMeFeatures;
  children?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export type BreadcrumbItem = {
  href?: string;
  label: string;
  icon?: LucideIcon | NavIconKey;
};

export type AccountSectionId = "profile" | "data-privacy";
export type AccountProfileModalId = "subscription" | "sessions" | "notifications" | "data-privacy";

export const ACCOUNT_SECTION_CHANGE_EVENT = "account:section-change";
export const ACCOUNT_SECTION_NAVIGATE_EVENT = "account:section-navigate";

const futureItem = (key: string, label: string, icon: NavIconKey, disabledHint: string): NavItem => ({
  key,
  label,
  icon,
  disabled: true,
  disabledHint,
});

export const appNavSections: NavSection[] = [
  {
    title: "Рынок",
    items: [
      { key: "news", href: "/news", label: "Новости", icon: "news" },
      { key: "indices", href: "/indices", label: "Индексы цен", icon: "indices" },
      { key: "forum", href: "/forum", label: "Форум", icon: "forum" },
    ],
  },
  {
    title: "Базы знаний",
    items: [
      {
        key: "education",
        href: "/education",
        label: "Обучение",
        icon: "education",
        companyTypes: EDUCATION_COMPANY_TYPES,
      },
      { key: "knowledge-base", href: "/knowledge-base", label: "Сырьё", icon: "knowledge" },
      { key: "docs", href: "/documentation", label: "Документация", icon: "docs" },
    ],
  },
  {
    title: "Инструменты",
    items: [
      {
        key: "calculator-retail",
        href: "/calculators/retail",
        label: "Калькулятор",
        icon: "calculator",
        companyTypes: ["collector"],
      },
      futureItem("sales-prices", "Продажные цены", "sales-prices", "Продажные цены — аналитика цен продаж."),
      futureItem(
        "analytics-map",
        "Карта аналитики",
        "analytics-map",
        "Карта аналитики — географические срезы по рынку.",
      ),
      futureItem(
        "participant-map",
        "Карта участников",
        "map",
        "Карта участников — география переработчиков, складов и логистики.",
      ),
      {
        key: "marketplace",
        href: "/marketplace",
        label: "Торговая площадка",
        icon: "marketplace",
        feature: "marketplace",
      },
    ],
  },
  {
    title: "Служебное",
    items: [
      // Личный кабинет и уведомления уже доступны через иконки в топбаре —
      // здесь дублировать не нужно. Админские разделы собраны в одной панели.
      {
        key: "admin",
        href: "/admin",
        label: "Панель управления",
        icon: "admin",
        activePathPrefixes: ["/admin"],
        roles: ["admin", "content_manager", "moderator"],
      },
    ],
  },
];

const accountSettingsItems: NavItem[] = [
  { href: "/account/profile", label: "Профиль", icon: "profile" },
  { href: accountProfileModalHref("data-privacy"), label: "Данные и приватность", icon: "data-privacy" },
];

const accountProfileMenuItems: NavItem[] = [
  { href: "/account/profile", label: "Профиль", icon: "profile" },
  { href: accountProfileModalHref("subscription"), label: "Подписка", icon: "subscription" },
  { href: accountProfileModalHref("sessions"), label: "Сессии", icon: "sessions" },
  { href: accountProfileModalHref("notifications"), label: "Уведомления", icon: "notifications" },
  { href: accountProfileModalHref("data-privacy"), label: "Данные и приватность", icon: "data-privacy" },
];

const accountStaffMenuItems: NavItem[] = [
  { href: "/account/profile", label: "Профиль", icon: "profile" },
  { href: accountProfileModalHref("data-privacy"), label: "Данные и приватность", icon: "data-privacy" },
];

export function getAccountNavSections(): NavSection[] {
  return [
    {
      title: "Переход",
      items: [{ href: "/news", label: "К платформе", icon: "back" }],
    },
    {
      title: "Настройки",
      items: accountSettingsItems,
    },
  ];
}

export function getAccountMenuSections(includeBusiness: boolean): NavSection[] {
  return [
    {
      title: "Настройки",
      items: includeBusiness ? accountProfileMenuItems : accountStaffMenuItems,
    },
  ];
}

export function isAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

export function normalizeAccountSection(value: string): AccountSectionId | null {
  return accountSectionIds.has(value as AccountSectionId) ? (value as AccountSectionId) : null;
}

export function accountSectionHref(section: AccountSectionId): string {
  return `/account/${section}`;
}

export function accountProfileModalHref(modal: AccountProfileModalId): string {
  return `${accountSectionHref("profile")}?modal=${modal}`;
}

export function normalizeAccountProfileModal(value: string | null | undefined): AccountProfileModalId | null {
  return accountProfileModalIds.has(value as AccountProfileModalId) ? (value as AccountProfileModalId) : null;
}

export function accountProfileModalFromHref(href: string | undefined): AccountProfileModalId | null {
  if (!href) return null;
  const [, query = ""] = href.split("?");
  const modal = new URLSearchParams(query).get("modal");
  return normalizeAccountProfileModal(modal);
}

export function accountSectionFromHref(href: string | undefined): AccountSectionId | null {
  if (!href) return null;
  if (href === "/account") return "profile";
  if (!href.startsWith("/account/")) return null;

  const [section] = href.slice("/account/".length).split(/[?#/]/);
  return section ? normalizeAccountSection(section) : null;
}

export function getLegacyAccountTabHref(tab: string | null | undefined): string | null {
  if (!tab) return null;
  return legacyAccountTabToHref.get(tab) ?? null;
}

export function futureNavItems(sections: NavSection[] = appNavSections): NavItem[] {
  return sections.flatMap((section) => flattenItems(section.items)).filter((item) => item.disabled);
}

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  const selfActive = Boolean(item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  const prefixActive = Boolean(
    item.activePathPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  return selfActive || prefixActive || Boolean(item.children?.some((child) => isNavItemActive(child, pathname)));
}

export function getBreadcrumbTrail(nav: NavSection[], pathname: string): BreadcrumbItem[] | null {
  const accountTrail = getAccountBreadcrumbTrail(pathname);
  if (accountTrail) return accountTrail;

  const adminTrail = getAdminBreadcrumbTrail(pathname);
  if (adminTrail) return adminTrail;

  for (const section of nav) {
    for (const item of section.items) {
      if (isNavItemActive(item, pathname)) {
        return [{ label: section.title }, { href: item.href, label: item.label, icon: item.icon }];
      }
    }
  }

  return null;
}

function flattenItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
}

const adminPanelRoot: BreadcrumbItem = {
  href: "/admin",
  label: "Панель управления",
  icon: "admin",
};

const adminContentRoot: BreadcrumbItem = {
  label: "CMS",
};

const adminBreadcrumbs: { prefix: string; trail: BreadcrumbItem[] }[] = [
  {
    prefix: "/admin/analytics",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/analytics", label: "Аналитика" }],
  },
  {
    prefix: "/admin/content/knowledge-base",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/knowledge-base", label: "База знаний" }],
  },
  {
    prefix: "/admin/content/documentation",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/documentation", label: "Документация" }],
  },
  {
    prefix: "/admin/content/forum",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/forum", label: "Форум" }],
  },
  {
    prefix: "/admin/content/education",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/education", label: "Обучение" }],
  },
  {
    prefix: "/admin/content/indices",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/indices", label: "Индексы цен" }],
  },
  {
    prefix: "/admin/content/news",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/news", label: "Новости" }],
  },
  { prefix: "/admin/users", trail: [adminPanelRoot, { href: "/admin/users", label: "Пользователи" }] },
  { prefix: "/admin/companies", trail: [adminPanelRoot, { href: "/admin/companies", label: "Компании" }] },
  { prefix: "/admin/staff", trail: [adminPanelRoot, { href: "/admin/staff", label: "Сотрудники" }] },
  { prefix: "/admin/support", trail: [adminPanelRoot, { href: "/admin/support", label: "Поддержка" }] },
  { prefix: "/admin/moderation", trail: [adminPanelRoot, { href: "/admin/moderation", label: "Очередь модерации" }] },
  { prefix: "/admin/settings", trail: [adminPanelRoot, { href: "/admin/settings", label: "Настройки" }] },
  { prefix: "/admin/journals", trail: [adminPanelRoot, { href: "/admin/journals", label: "Журнал" }] },
  { prefix: "/admin", trail: [adminPanelRoot] },
];

function getAdminBreadcrumbTrail(pathname: string): BreadcrumbItem[] | null {
  return adminBreadcrumbs.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.trail ?? null;
}

const accountRoot: BreadcrumbItem = {
  href: "/account/profile",
  label: "Настройки аккаунта",
  icon: "profile",
};

const accountBreadcrumbs: { prefix: string; section: AccountSectionId; label: string }[] = [
  { prefix: "/account/profile", section: "profile", label: "Профиль" },
  { prefix: "/account/data-privacy", section: "data-privacy", label: "Данные и приватность" },
];

const accountSectionIds = new Set<AccountSectionId>(accountBreadcrumbs.map((item) => item.section));
const accountProfileModalIds = new Set<AccountProfileModalId>([
  "subscription",
  "sessions",
  "notifications",
  "data-privacy",
]);

const legacyAccountTabToHref = new Map<string, string>([
  ["profile", accountSectionHref("profile")],
  ["security", accountSectionHref("profile")],
  ["notifications", accountProfileModalHref("notifications")],
  ["company", accountSectionHref("profile")],
  ["billing", accountProfileModalHref("subscription")],
  ["sessions", accountProfileModalHref("sessions")],
  ["support", accountSectionHref("profile")],
]);

function getAccountBreadcrumbTrail(pathname: string): BreadcrumbItem[] | null {
  if (pathname === "/account" || pathname.startsWith("/account/")) {
    return [accountRoot];
  }

  return null;
}
