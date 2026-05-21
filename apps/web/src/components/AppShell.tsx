"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Boxes,
  FileText,
  GraduationCap,
  HelpCircle,
  LineChart,
  MessageCircle,
  Newspaper,
  Settings,
  Shield,
  ShoppingBag,
  Users,
} from "lucide-react";
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
      { href: "/indices", label: "Индексы", icon: Boxes },
      { href: "/education", label: "Обучение", icon: GraduationCap },
    ],
  },
  {
    title: "Сообщество",
    items: [
      { label: "Торговая площадка", icon: ShoppingBag, disabled: true },
      { label: "Форум", icon: MessageCircle, disabled: true },
    ],
  },
  {
    title: "Базы",
    items: [
      {
        label: "Базы знаний",
        icon: BookOpen,
        disabled: true,
        children: [
          { href: "/knowledge-base", label: "Сырьё", icon: BookOpen },
          { label: "Документация", icon: FileText, disabled: true },
        ],
      },
    ],
  },
  {
    title: "Инструменты",
    items: [
      {
        label: "Карты",
        icon: Users,
        disabled: true,
        children: [
          { label: "Заводы и заготовители", icon: Users, disabled: true },
          { label: "Аналитика регионов", icon: LineChart, disabled: true },
        ],
      },
      {
        label: "Калькуляторы",
        icon: FileText,
        disabled: true,
        children: [
          { label: "Розничный", icon: FileText, disabled: true },
          { label: "Оптовый", icon: FileText, disabled: true },
          { label: "Продажные цены", icon: LineChart, disabled: true },
        ],
      },
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
  const { user } = useAuth();
  const visibleNav = nav.map((section) => ({
    ...section,
    items: filterVisibleItems(section.items, user?.platformRoles ?? []),
  }));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/news">
          <span className="brand-mark">Э</span>
          <span>ЭкоПлатформа</span>
        </Link>
        {visibleNav.map((section) => (
          <nav className="nav-section" key={section.title}>
            <p className="nav-title">{section.title}</p>
            {section.items.map((item) => (
              <NavEntry item={item} key={item.href ?? item.label} pathname={pathname} />
            ))}
          </nav>
        ))}
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="topbar-search" />
          <NotificationBell />
          <button className="icon-button" title="Настройки">
            <Settings size={25} />
          </button>
          <Link className="avatar" title={user ? `${user.firstName} ${user.lastName}` : "Войти"} href={user ? "/account" : "/login"} />
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
