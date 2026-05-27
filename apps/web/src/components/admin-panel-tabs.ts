import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  Building2,
  CreditCard,
  GraduationCap,
  Headphones,
  Newspaper,
  ScrollText,
  Settings2,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";

export type AdminPanelTab = {
  href: string;
  label: string;
  pathname: string;
  hash?: string;
  roles: readonly string[];
};

export type AdminHomeItem = AdminPanelTab & {
  description: string;
  icon: LucideIcon;
};

export type AdminHomeGroup = {
  title: string;
  items: AdminHomeItem[];
};

const newsTab: AdminPanelTab = {
  href: "/admin/content/news",
  label: "Новости",
  pathname: "/admin/content/news",
  roles: ["admin", "content_manager"],
};

const indicesTab: AdminPanelTab = {
  href: "/admin/content/indices",
  label: "Индексы цен",
  pathname: "/admin/content/indices",
  roles: ["admin", "content_manager"],
};

const educationTab: AdminPanelTab = {
  href: "/admin/content/education",
  label: "Обучение",
  pathname: "/admin/content/education",
  roles: ["admin", "content_manager"],
};

const knowledgeBaseTab: AdminPanelTab = {
  href: "/admin/content/knowledge-base",
  label: "База знаний",
  pathname: "/admin/content/knowledge-base",
  roles: ["admin", "content_manager"],
};

const ADMIN_HOME_GROUPS: AdminHomeGroup[] = [
  {
    title: "CMS",
    items: [
      {
        ...newsTab,
        description: "Новостные публикации и редактор материалов.",
        icon: Newspaper,
      },
      {
        ...indicesTab,
        description: "Ценовые категории, номенклатура и значения.",
        icon: TrendingUp,
      },
      {
        ...educationTab,
        description: "Курсы, главы и уроки для пользователей.",
        icon: GraduationCap,
      },
      {
        ...knowledgeBaseTab,
        description: "Статьи и разделы отраслевой базы знаний.",
        icon: BookOpen,
      },
    ],
  },
  {
    title: "Операции",
    items: [
      {
        href: "/admin/users",
        label: "Пользователи",
        pathname: "/admin/users",
        roles: ["admin"],
        description: "Учётные записи, статусы и роли доступа.",
        icon: Users,
      },
      {
        href: "/admin/companies",
        label: "Компании",
        pathname: "/admin/companies",
        roles: ["admin"],
        description: "Карточки компаний, статусы и подписки.",
        icon: Building2,
      },
      {
        href: "/admin/staff",
        label: "Сотрудники",
        pathname: "/admin/staff",
        roles: ["admin"],
        description: "Команда платформы и служебные роли.",
        icon: UserCog,
      },
      {
        href: "/admin/support",
        label: "Поддержка",
        pathname: "/admin/support",
        roles: ["admin"],
        description: "Обращения клиентов и ответы поддержки.",
        icon: Headphones,
      },
      {
        href: "/admin/billing",
        label: "Подписки",
        pathname: "/admin/billing",
        roles: ["admin"],
        description: "Ручная активация и контроль тарифов.",
        icon: CreditCard,
      },
    ],
  },
  {
    title: "Контроль",
    items: [
      {
        href: "/admin/moderation",
        label: "Очередь модерации",
        pathname: "/admin/moderation",
        roles: ["admin", "moderator"],
        description: "Жалобы, кейсы и решения модераторов.",
        icon: ShieldAlert,
      },
      {
        href: "/admin/settings#moderation",
        label: "Модерация",
        pathname: "/admin/settings",
        hash: "moderation",
        roles: ["admin"],
        description: "Правила санкций и сроков блокировок.",
        icon: Settings2,
      },
      {
        href: "/admin/journals",
        label: "Журнал",
        pathname: "/admin/journals",
        roles: ["admin"],
        description: "История админ-действий и изменений.",
        icon: ScrollText,
      },
    ],
  },
  {
    title: "Настройки",
    items: [
      {
        href: "/admin/settings#demo",
        label: "Демо-доступ",
        pathname: "/admin/settings",
        hash: "demo",
        roles: ["admin"],
        description: "Параметры пробного периода.",
        icon: BarChart3,
      },
      {
        href: "/admin/settings#indices",
        label: "Индексы",
        pathname: "/admin/settings",
        hash: "indices",
        roles: ["admin"],
        description: "Пороговые значения и рыночные настройки.",
        icon: SlidersHorizontal,
      },
      {
        href: "/admin/settings#other",
        label: "Прочее",
        pathname: "/admin/settings",
        hash: "other",
        roles: ["admin"],
        description: "Остальные параметры платформы.",
        icon: Wrench,
      },
    ],
  },
];

export function visibleAdminHomeGroups(roles: readonly string[]): AdminHomeGroup[] {
  return ADMIN_HOME_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.some((role) => roles.includes(role))),
  })).filter((group) => group.items.length > 0);
}
