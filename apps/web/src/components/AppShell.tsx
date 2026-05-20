"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BookOpen,
  Boxes,
  Calendar,
  FileText,
  GraduationCap,
  HelpCircle,
  Home,
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
  href: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  roles?: string[];
};

const nav: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "Главная",
    items: [
      { href: "/news", label: "Новости", icon: Newspaper },
      { href: "/indices", label: "Индексы цен", icon: Boxes },
      { href: "#", label: "Видео", icon: Home, disabled: true },
      { href: "#", label: "Календарь", icon: Calendar, disabled: true },
    ],
  },
  {
    title: "Сообщество",
    items: [
      { href: "#", label: "Форум", icon: MessageCircle, disabled: true },
      { href: "#", label: "Торговая площадка", icon: ShoppingBag, disabled: true },
      { href: "#", label: "Карта переработчиков", icon: Users, disabled: true },
    ],
  },
  {
    title: "База знаний",
    items: [
      { href: "/knowledge-base", label: "Вторсырьё", icon: BookOpen },
      { href: "/education", label: "Обучение", icon: GraduationCap },
    ],
  },
  {
    title: "Инструменты",
    items: [
      { href: "#", label: "Калькуляторы", icon: FileText, disabled: true },
      { href: "#", label: "Интеграции", icon: LineChart, disabled: true },
      { href: "#", label: "Магазин", icon: ShoppingBag, disabled: true },
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
      { href: "/admin/support", label: "Поддержка", icon: HelpCircle, roles: ["admin"] },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/news">
          <span className="brand-mark">Э</span>
          <span>ЭкоПлатформа</span>
        </Link>
        {nav.map((section) => (
          <nav className="nav-section" key={section.title}>
            <p className="nav-title">{section.title}</p>
            {section.items.filter((item) => !item.roles || item.roles.some((role) => user?.platformRoles.includes(role))).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return item.disabled ? (
                <span className="nav-link disabled" key={item.label}>
                  <Icon size={19} />
                  {item.label}
                </span>
              ) : (
                <Link className={`nav-link ${active ? "active" : ""}`} href={item.href} key={item.href}>
                  <Icon size={19} />
                  {item.label}
                </Link>
              );
            })}
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
