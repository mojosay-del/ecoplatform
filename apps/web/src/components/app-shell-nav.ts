import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calculator,
  FileText,
  GraduationCap,
  LayoutDashboard,
  LineChart,
  Map,
  MessageCircle,
  Newspaper,
  ShoppingBag,
  Store,
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
      futureItem("Карты", Map, "Карты — география переработчиков, складов и логистики."),
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
