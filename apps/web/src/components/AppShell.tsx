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

  if (!ready || !token) {
    return null;
  }

  const visibleNav = nav.map((section) => ({
    ...section,
    items: filterVisibleItems(section.items, user?.platformRoles ?? []),
  }));

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="sidebar-head">
          <Link className="brand" href="/news">
            <span className="brand-mark">
              <Leaf size={28} strokeWidth={2.2} />
            </span>
            <span>ЭкоПлатформа</span>
          </Link>
          <button
            className="sidebar-close"
            type="button"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Закрыть меню"
          >
            <X size={20} />
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
          <div className="topbar-spacer" />
          <NotificationBell />
          <Link className="icon-button" href="/admin/support" title="Помощь">
            <HelpCircle size={20} />
          </Link>
          <Link className="icon-button" href="/account" title="Настройки">
            <Settings size={20} />
          </Link>
          <Link
            className="avatar"
            title={user ? `${user.firstName} ${user.lastName}` : "Войти"}
            href={user ? "/account" : "/login"}
          />
        </header>
        {children}
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
        <Link className={className} href={item.href}>
          <Icon size={iconSize} />
          {item.label}
        </Link>
      ) : (
        <span className={className}>
          <Icon size={iconSize} />
          {item.label}
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

function filterVisibleItems(items: NavItem[], roles: string[]): NavItem[] {
  return items
    .filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)))
    .map((item) => ({
      ...item,
      children: item.children ? filterVisibleItems(item.children, roles) : undefined,
    }));
}
