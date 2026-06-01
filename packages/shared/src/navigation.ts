import { z } from "zod";

// Канонический список пунктов левого меню платформы. Структура меню
// (категории, порядок, иконки, метки) живёт в коде фронта (app-shell-nav.ts);
// здесь — стабильные КЛЮЧИ пунктов, по которым админ управляет ВИДИМОСТЬЮ
// (скрыть/показать), и маппинг на guardKey для блокировки страниц на бэке.
// Единый источник истины для фронта и бэка.

export const navSectionKeys = ["main", "community", "automation", "knowledge", "tools", "service"] as const;
export type NavSectionKey = (typeof navSectionKeys)[number];

export const navSectionTitles: Record<NavSectionKey, string> = {
  main: "Главная",
  community: "Сообщество",
  automation: "Автоматизация",
  knowledge: "Базы знаний",
  tools: "Инструменты",
  service: "Служебное",
};

export type NavMenuItemDef = {
  // Стабильный ключ пункта (совпадает с `key` в appNavSections на фронте).
  key: string;
  label: string;
  section: NavSectionKey;
  // Маршрут для реально доступных разделов (нужен для фронт-редиректа со
  // скрытого пути).
  href?: string;
  // Ключ для блокировки страницы на бэке (@Section в content.controller).
  // Есть только у маршрутизируемых разделов.
  guardKey?: string;
  // Пункт-заглушка «на вырост» (disabled, без страницы) — скрытие чисто
  // косметическое.
  placeholder?: boolean;
};

// Пункт `/admin` (Панель управления) НЕ включён намеренно: он управляется
// ролями и его нельзя скрывать через этот механизм (иначе админ потеряет
// доступ к панели).
export const navMenuItems: NavMenuItemDef[] = [
  { key: "news", label: "Новости", section: "main", href: "/news", guardKey: "news" },
  { key: "indices", label: "Индексы цен", section: "main", href: "/indices", guardKey: "indices" },
  { key: "education", label: "Обучение", section: "main", href: "/education", guardKey: "education" },
  { key: "marketplace", label: "Торговая площадка", section: "main", placeholder: true },
  { key: "forum", label: "Форум", section: "community", placeholder: true },
  { key: "shop", label: "Магазин", section: "automation", placeholder: true },
  {
    key: "knowledge-base",
    label: "Сырьё",
    section: "knowledge",
    href: "/knowledge-base",
    guardKey: "knowledge-base",
  },
  { key: "docs", label: "Документация", section: "knowledge", placeholder: true },
  { key: "maps", label: "Карты", section: "tools", placeholder: true },
  { key: "calculators", label: "Калькуляторы", section: "tools", placeholder: true },
];

const navMenuItemKeySet = new Set(navMenuItems.map((item) => item.key));

export function isNavMenuItemKey(key: string): boolean {
  return navMenuItemKeySet.has(key);
}

// guardKey → ключ пункта. Один guardKey соответствует ровно одному пункту.
export function navItemKeyForGuardKey(guardKey: string): string | undefined {
  return navMenuItems.find((item) => item.guardKey === guardKey)?.key;
}

export const navVisibilitySchema = z.object({
  hiddenKeys: z.array(z.string()).default([]),
});
export type NavVisibilityInput = z.infer<typeof navVisibilitySchema>;

// Ответ публичного эндпоинта /navigation/visibility.
export type NavVisibilityResponse = {
  hiddenKeys: string[];
  hiddenHrefs: string[];
};

// Ответ админского GET /admin/navigation — пункты, сгруппированные по
// категориям, с текущим флагом hidden (для редактора).
export type AdminNavItem = NavMenuItemDef & { hidden: boolean };
export type AdminNavSection = { key: NavSectionKey; title: string; items: AdminNavItem[] };
export type AdminNavResponse = { sections: AdminNavSection[] };
