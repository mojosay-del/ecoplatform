import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Building2,
  CreditCard,
  FileText,
  Gauge,
  GraduationCap,
  Headphones,
  Megaphone,
  MessageCircle,
  Newspaper,
  ScrollText,
  ShieldAlert,
  SlidersHorizontal,
  TrendingUp,
  UserCog,
  Users,
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

const analyticsTab: AdminPanelTab = {
  href: "/admin/analytics",
  label: "Аналитика",
  pathname: "/admin/analytics",
  roles: ["admin"],
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

const documentationTab: AdminPanelTab = {
  href: "/admin/content/documentation",
  label: "Документация",
  pathname: "/admin/content/documentation",
  roles: ["admin", "content_manager"],
};

const forumTab: AdminPanelTab = {
  href: "/admin/content/forum",
  label: "Форум",
  pathname: "/admin/content/forum",
  roles: ["admin", "content_manager", "moderator"],
};

const ADMIN_HOME_GROUPS: AdminHomeGroup[] = [
  {
    title: "CMS",
    items: [
      {
        ...analyticsTab,
        description: "Состояние платформы, метрики и операционные сигналы.",
        icon: Gauge,
      },
      {
        ...newsTab,
        description: "Новостные публикации и редактор материалов.",
        icon: Newspaper,
      },
      {
        ...indicesTab,
        description: "Номенклатура и значения ценовых индексов.",
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
      {
        ...documentationTab,
        description: "Шаблоны, регламенты и отраслевые справки с файлами.",
        icon: FileText,
      },
      {
        ...forumTab,
        description: "Вопросы, ответы, закрепления и засев контента.",
        icon: MessageCircle,
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
        href: "/admin/broadcast",
        label: "Рассылка",
        pathname: "/admin/broadcast",
        roles: ["admin"],
        description: "Уведомления пользователям от платформы с фильтрами по аудитории.",
        icon: Megaphone,
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
        href: "/admin/settings",
        label: "Настройки платформы",
        pathname: "/admin/settings",
        roles: ["admin"],
        description: "Регистрация, демо-доступ, пороги индексов и прочие параметры.",
        icon: SlidersHorizontal,
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
