"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Boxes,
  Calculator,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  GraduationCap,
  HelpCircle,
  Leaf,
  LineChart,
  Map,
  Menu,
  MessageCircle,
  Newspaper,
  Settings,
  Shield,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { NotificationBell } from "./NotificationBell";

type NavItem = {
  href?: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  roles?: string[];
  children?: NavItem[];
};

const nav: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Главная",
    items: [
      { href: "/news", label: "Новости", icon: Newspaper },
      { href: "/indices", label: "Индексы цен", icon: LineChart },
      { href: "/education", label: "Обучение", icon: GraduationCap },
    ],
  },
  {
    title: "Сообщество",
    items: [
      { label: "Форум", icon: MessageCircle, disabled: true },
      { label: "Торговая площадка", icon: ShoppingBag, disabled: true },
    ],
  },
  {
    title: "Базы знаний",
    items: [
      { href: "/knowledge-base", label: "Сырьё", icon: BookOpen },
      { label: "Документация", icon: FileText, disabled: true },
    ],
  },
  {
    title: "Инструменты",
    items: [
      { label: "Карты", icon: Map, disabled: true },
      { label: "Калькуляторы", icon: Calculator, disabled: true },
    ],
  },
  {
    title: "Служебное",
    items: [
      { href: "/account", label: "Личный кабинет", icon: Settings },
      { href: "/notifications", label: "Уведомления", icon: Bell },
      { href: "/admin/content/news", label: "Админ / CMS", icon: Shield, roles: ["admin", "content_manager"] },
      { href: "/admin/moderation", label: "Модерация", icon: Shield, roles: ["admin", "moderator"] },
      { href: "/admin/users", label: "Пользователи", icon: Users, roles: ["admin"] },
      { href: "/admin/companies", label: "Компании", icon: Boxes, roles: ["admin"] },
      { href: "/admin/staff", label: "Сотрудники", icon: Shield, roles: ["admin"] },
      { href: "/admin/journals", label: "Журнал действий", icon: FileText, roles: ["admin"] },
      { href: "/admin/settings", label: "Настройки", icon: Settings, roles: ["admin"] },
      { href: "/admin/support", label: "Поддержка", icon: HelpCircle, roles: ["admin"] },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, ready } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Любой защищённый раздел оборачивается в AppShell. Если AuthProvider уже
  // проверил localStorage и токена нет — отправляем на /login. До ready
  // ничего не делаем, чтобы не сорвать сессию у залогиненного пользователя
  // в момент гидратации страницы.
  useEffect(() => {
    if (ready && !token) {
      router.replace("/login");
    }
  }, [ready, token, router]);

  // При смене страницы — закрываем мобильное меню, иначе остаётся
  // открыто после перехода.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Запоминаем свёртку сайдбара между сессиями (только desktop-режим).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("eco_sidebar_collapsed") === "1");
    } catch {
      // ignore (private mode)
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("eco_sidebar_collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (!ready || !token) {
    return null;
  }

  const visibleNav = nav.map((section) => ({
    ...section,
    items: filterVisibleItems(section.items, user?.platformRoles ?? []),
  }));

  return (
    <div className="app-shell" data-collapsed={collapsed ? "true" : "false"}>
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-head">
          <Link className="brand" href="/news">
            <span className="brand-mark">
              <Leaf size={28} strokeWidth={2.2} />
            </span>
            <span className="brand-text">ЭкоПлатформа</span>
          </Link>
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть меню"
          >
            <X size={20} />
          </button>
          <button
            className="sidebar-collapse"
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
            title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          >
            {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          </button>
        </div>
        {visibleNav.map((section) => (
          <nav className="nav-section" key={section.title}>
            <p className="nav-title">{section.title}</p>
            {section.items.map((item) => (
              <NavEntry item={item} key={item.href ?? item.label} pathname={pathname} />
            ))}
          </nav>
        ))}
      </aside>
      {mobileNavOpen ? (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      ) : null}
      <main className="main">
        <header className="topbar">
          <button
            className="icon-button mobile-menu-button"
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu size={20} />
          </button>
          <Breadcrumb nav={visibleNav} pathname={pathname} />
          <div className="topbar-spacer" />
          <NotificationBell />
          <Link className="icon-button" href="/admin/support" title="Помощь">
            <HelpCircle size={20} />
          </Link>
          <Link className="icon-button" href="/account" title="Настройки">
            <Settings size={20} />
          </Link>
          <Link
            className={`avatar ${user?.avatarUrl ? "avatar-with-image" : ""}`}
            title={user ? `${user.firstName} ${user.lastName}` : "Войти"}
            href={user ? "/account" : "/login"}
          >
            {user?.avatarUrl ? <img alt="" src={user.avatarUrl} /> : null}
          </Link>
        </header>
        <div className="page-surface">{children}</div>
      </main>
    </div>
  );
}

function NavEntry({ item, pathname, child = false }: { item: NavItem; pathname: string; child?: boolean }) {
  const Icon = item.icon;
  const active = isActiveNavItem(item, pathname);
  const className = `nav-link ${child ? "nav-link-child" : ""} ${active ? "active" : ""} ${item.disabled ? "disabled" : ""}`;
  const iconSize = child ? 16 : 19;

  return (
    <div className="nav-entry">
      {item.href && !item.disabled ? (
        <Link className={className} href={item.href} title={item.label}>
          <Icon size={iconSize} />
          <span className="nav-label">{item.label}</span>
        </Link>
      ) : (
        <span className={className} title={item.label}>
          <Icon size={iconSize} />
          <span className="nav-label">{item.label}</span>
        </span>
      )}
      {item.children?.length ? (
        <div className="nav-children">
          {item.children.map((childItem) => (
            <NavEntry child item={childItem} key={childItem.href ?? childItem.label} pathname={pathname} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function isActiveNavItem(item: NavItem, pathname: string): boolean {
  const selfActive = Boolean(item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return selfActive || Boolean(item.children?.some((child) => isActiveNavItem(child, pathname)));
}

// Хлебные крошки в топбаре: ищем в навигации активный пункт и показываем
// «Категория / Пункт» (например, «Главная / Обучение»). Если ничего не нашли —
// прячем (на /login и подобных страницах AppShell всё равно не отрисуется).
function Breadcrumb({
  nav,
  pathname,
}: {
  nav: Array<{ title: string; items: NavItem[] }>;
  pathname: string;
}) {
  let sectionTitle: string | null = null;
  let activeItem: NavItem | null = null;
  let activeHref: string | null = null;
  for (const section of nav) {
    for (const item of section.items) {
      if (isActiveNavItem(item, pathname)) {
        sectionTitle = section.title;
        activeItem = item;
        activeHref = item.href ?? null;
        break;
      }
    }
    if (activeItem) break;
  }

  if (!sectionTitle || !activeItem) return null;
  const Icon = activeItem.icon;

  return (
    <nav className="topbar-breadcrumb" aria-label="Хлебные крошки">
      <span className="topbar-breadcrumb-section">{sectionTitle}</span>
      <span className="topbar-breadcrumb-sep" aria-hidden>
        /
      </span>
      {activeHref ? (
        <Link className="topbar-breadcrumb-current" href={activeHref}>
          <Icon size={15} />
          <span>{activeItem.label}</span>
        </Link>
      ) : (
        <span className="topbar-breadcrumb-current">
          <Icon size={15} />
          <span>{activeItem.label}</span>
        </span>
      )}
    </nav>
  );
}

function filterVisibleItems(items: NavItem[], roles: string[]): NavItem[] {
  return items
    .filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)))
    .map((item) => ({
      ...item,
      children: item.children ? filterVisibleItems(item.children, roles) : undefined,
    }));
}
