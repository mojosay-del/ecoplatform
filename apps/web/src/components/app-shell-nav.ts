import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  CreditCard,
  Database,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  LineChart,
  LifeBuoy,
  Map as MapIcon,
  MessageCircle,
  Newspaper,
  ShoppingBag,
  Smartphone,
  Store,
  UserRound,
} from "lucide-react";

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  activePathPrefixes?: string[];
  disabled?: boolean;
  disabledHint?: string;
  roles?: string[];
  children?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export type BreadcrumbItem = {
  href?: string;
  label: string;
  icon?: LucideIcon;
};

export type AccountSectionId =
  | "profile"
  | "security"
  | "notifications"
  | "data-privacy"
  | "sessions"
  | "company"
  | "billing"
  | "support";

const futureItem = (label: string, icon: LucideIcon, disabledHint: string): NavItem => ({
  label,
  icon,
  disabled: true,
  disabledHint,
});

export const appNavSections: NavSection[] = [
  {
    title: "Главная",
    items: [
      { href: "/news", label: "Новости", icon: Newspaper },
      { href: "/indices", label: "Индексы цен", icon: LineChart },
      { href: "/education", label: "Обучение", icon: GraduationCap },
      futureItem("Торговая площадка", ShoppingBag, "Торговая площадка — закрытый аукцион на объявлениях."),
    ],
  },
  {
    title: "Сообщество",
    items: [futureItem("Форум", MessageCircle, "Форум — обсуждения участников рынка.")],
  },
  {
    title: "Автоматизация",
    items: [futureItem("Магазин", Store, "Магазин — каталог решений и сервисов для участников рынка.")],
  },
  {
    title: "Базы знаний",
    items: [
      { href: "/knowledge-base", label: "Сырьё", icon: BookOpen },
      futureItem("Документация", FileText, "Документация — шаблоны, регламенты и отраслевые справки."),
    ],
  },
  {
    title: "Инструменты",
    items: [
      futureItem("Карты", MapIcon, "Карты — география переработчиков, складов и логистики."),
      futureItem("Калькуляторы", Calculator, "Калькуляторы — расчёт экономики сделок, логистики и переработки."),
    ],
  },
  {
    title: "Служебное",
    items: [
      // Личный кабинет и уведомления уже доступны через иконки в топбаре —
      // здесь дублировать не нужно. Админские разделы собраны в одной панели.
      {
        href: "/admin",
        label: "Панель управления",
        icon: LayoutDashboard,
        activePathPrefixes: ["/admin"],
        roles: ["admin", "content_manager", "moderator"],
      },
    ],
  },
];

const accountSettingsItems: NavItem[] = [
  { href: "/account/profile", label: "Профиль", icon: UserRound },
  { href: "/account/security", label: "Безопасность", icon: KeyRound },
  { href: "/account/notifications", label: "Уведомления", icon: Bell },
  { href: "/account/data-privacy", label: "Данные и приватность", icon: Database },
  { href: "/account/sessions", label: "Сессии", icon: Smartphone },
];

const accountBusinessItems: NavItem[] = [
  { href: "/account/company", label: "Компания", icon: Building2 },
  { href: "/account/billing", label: "Подписка", icon: CreditCard },
  { href: "/account/support", label: "Поддержка", icon: LifeBuoy },
];

export const accountBusinessSections: AccountSectionId[] = ["company", "billing", "support"];

export function getAccountNavSections(includeBusiness: boolean): NavSection[] {
  return [
    {
      title: "Переход",
      items: [{ href: "/news", label: "К платформе", icon: ArrowLeft }],
    },
    {
      title: "Настройки",
      items: accountSettingsItems,
    },
    ...(includeBusiness
      ? [
          {
            title: "Компания",
            items: accountBusinessItems,
          },
        ]
      : []),
  ];
}

export function getAccountMenuSections(includeBusiness: boolean): NavSection[] {
  return getAccountNavSections(includeBusiness).filter((section) => section.title !== "Переход");
}

export function isAccountPath(pathname: string): boolean {
  return pathname === "/account" || pathname.startsWith("/account/");
}

export function isAccountBusinessSection(section: AccountSectionId): boolean {
  return accountBusinessSections.includes(section);
}

export function normalizeAccountSection(value: string): AccountSectionId | null {
  return accountSectionIds.has(value as AccountSectionId) ? (value as AccountSectionId) : null;
}

export function accountSectionHref(section: AccountSectionId): string {
  return `/account/${section}`;
}

export function getLegacyAccountTabHref(tab: string | null | undefined): string | null {
  if (!tab) return null;
  const section = legacyAccountTabToSection.get(tab);
  return section ? accountSectionHref(section) : null;
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
  icon: LayoutDashboard,
};

const adminContentRoot: BreadcrumbItem = {
  label: "CMS",
};

const adminBreadcrumbs: { prefix: string; trail: BreadcrumbItem[] }[] = [
  {
    prefix: "/admin/content/knowledge-base",
    trail: [adminPanelRoot, adminContentRoot, { href: "/admin/content/knowledge-base", label: "База знаний" }],
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
  { prefix: "/admin/billing", trail: [adminPanelRoot, { href: "/admin/billing", label: "Подписки" }] },
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
  icon: UserRound,
};

const accountBreadcrumbs: { prefix: string; section: AccountSectionId; label: string }[] = [
  { prefix: "/account/profile", section: "profile", label: "Профиль" },
  { prefix: "/account/security", section: "security", label: "Безопасность" },
  { prefix: "/account/notifications", section: "notifications", label: "Уведомления" },
  { prefix: "/account/data-privacy", section: "data-privacy", label: "Данные и приватность" },
  { prefix: "/account/sessions", section: "sessions", label: "Сессии" },
  { prefix: "/account/company", section: "company", label: "Компания" },
  { prefix: "/account/billing", section: "billing", label: "Подписка" },
  { prefix: "/account/support", section: "support", label: "Поддержка" },
];

const accountSectionIds = new Set<AccountSectionId>(accountBreadcrumbs.map((item) => item.section));

const legacyAccountTabToSection = new Map<string, AccountSectionId>([
  ["profile", "profile"],
  ["security", "security"],
  ["notifications", "notifications"],
  ["company", "company"],
  ["billing", "billing"],
  ["support", "support"],
]);

function getAccountBreadcrumbTrail(pathname: string): BreadcrumbItem[] | null {
  const matched = accountBreadcrumbs.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (matched) {
    return [accountRoot, { href: matched.prefix, label: matched.label }];
  }

  if (pathname === "/account") {
    return [accountRoot];
  }

  return null;
}
