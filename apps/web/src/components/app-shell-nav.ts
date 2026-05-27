import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calculator,
  FileText,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  LineChart,
  Map,
  MessageCircle,
  Newspaper,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Store,
} from "lucide-react";

export type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  disabledBadge?: string;
  disabledHint?: string;
  roles?: string[];
  children?: NavItem[];
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

export const COMING_SOON_BADGE = "Скоро · Q3 2026";

const futureItem = (label: string, icon: LucideIcon, disabledHint: string): NavItem => ({
  label,
  icon,
  disabled: true,
  disabledBadge: COMING_SOON_BADGE,
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
      // здесь дублировать не нужно. Секция показывается только админам.
      // Раньше «Компании» и «Сотрудники» были отдельными пунктами; теперь
      // это табы внутри «Пользователи» — так навигация чище.
      {
        href: "/admin/content/news",
        label: "Панель управления",
        icon: LayoutDashboard,
        roles: ["admin", "content_manager"],
      },
      { href: "/admin/moderation", label: "Модерация", icon: ShieldCheck, roles: ["admin", "moderator"] },
      { href: "/admin/settings", label: "Настройки", icon: Settings, roles: ["admin"] },
      { href: "/admin/support", label: "Поддержка", icon: HelpCircle, roles: ["admin"] },
    ],
  },
];

export function futureNavItems(sections: NavSection[] = appNavSections): NavItem[] {
  return sections.flatMap((section) => flattenItems(section.items)).filter((item) => item.disabled);
}

function flattenItems(items: NavItem[]): NavItem[] {
  return items.flatMap((item) => [item, ...(item.children ? flattenItems(item.children) : [])]);
}
