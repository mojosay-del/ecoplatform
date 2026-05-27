export type AdminPanelTab = {
  href: string;
  label: string;
  pathname: string;
  hash?: string;
  roles: readonly string[];
};

const ADMIN_PANEL_TABS: AdminPanelTab[] = [
  {
    href: "/admin/content/news",
    label: "Новости",
    pathname: "/admin/content/news",
    roles: ["admin", "content_manager"],
  },
  {
    href: "/admin/content/indices",
    label: "Индексы цен",
    pathname: "/admin/content/indices",
    roles: ["admin", "content_manager"],
  },
  {
    href: "/admin/content/education",
    label: "Обучение",
    pathname: "/admin/content/education",
    roles: ["admin", "content_manager"],
  },
  {
    href: "/admin/content/knowledge-base",
    label: "База знаний",
    pathname: "/admin/content/knowledge-base",
    roles: ["admin", "content_manager"],
  },
  { href: "/admin/users", label: "Пользователи", pathname: "/admin/users", roles: ["admin"] },
  { href: "/admin/companies", label: "Компании", pathname: "/admin/companies", roles: ["admin"] },
  { href: "/admin/staff", label: "Сотрудники", pathname: "/admin/staff", roles: ["admin"] },
  { href: "/admin/support", label: "Поддержка", pathname: "/admin/support", roles: ["admin"] },
  { href: "/admin/billing", label: "Подписки", pathname: "/admin/billing", roles: ["admin"] },
  {
    href: "/admin/moderation",
    label: "Очередь модерации",
    pathname: "/admin/moderation",
    roles: ["admin", "moderator"],
  },
  {
    href: "/admin/settings#moderation",
    label: "Модерация",
    pathname: "/admin/settings",
    hash: "moderation",
    roles: ["admin"],
  },
  { href: "/admin/settings#demo", label: "Демо-доступ", pathname: "/admin/settings", hash: "demo", roles: ["admin"] },
  { href: "/admin/settings#indices", label: "Индексы", pathname: "/admin/settings", hash: "indices", roles: ["admin"] },
  { href: "/admin/settings#other", label: "Прочее", pathname: "/admin/settings", hash: "other", roles: ["admin"] },
  { href: "/admin/journals", label: "Журнал", pathname: "/admin/journals", roles: ["admin"] },
];
const SETTINGS_HASHES = new Set(["moderation", "demo", "indices", "other"]);

export function visibleAdminPanelTabs(roles: readonly string[]) {
  return ADMIN_PANEL_TABS.filter((tab) => tab.roles.some((role) => roles.includes(role)));
}

export function isAdminPanelTabActive(tab: AdminPanelTab, pathname: string, hash: string) {
  if (pathname !== tab.pathname && !pathname.startsWith(`${tab.pathname}/`)) return false;
  if (!tab.hash) return true;
  const currentHash = SETTINGS_HASHES.has(hash) ? hash : "moderation";
  return currentHash === tab.hash;
}
