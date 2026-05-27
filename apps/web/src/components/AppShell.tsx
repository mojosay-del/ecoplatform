"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { ChevronsLeft, ChevronsRight, HelpCircle, Menu, Settings, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { appNavSections, COMING_SOON_BADGE, type NavItem, type NavSection } from "./app-shell-nav";
import { DemoBanner } from "./DemoBanner";
import { NotificationBell } from "./NotificationBell";
import { UserSupportDrawer } from "./UserSupportDrawer";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, ready } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  // У админов своя полноценная страница /admin/support — drawer им
  // показывать не нужно, иначе двойная сущность.
  const isAdminUser = (user?.platformRoles?.length ?? 0) > 0;

  // Любой защищённый раздел оборачивается в AppShell. Если AuthProvider уже
  // попробовал восстановить refresh-cookie и токена нет — отправляем на /login.
  // До ready ничего не делаем, чтобы не сорвать сессию у залогиненного
  // пользователя в момент гидратации страницы.
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

  useEffect(() => {
    const handler = () => setSupportOpen(true);
    window.addEventListener("support:open", handler);
    return () => window.removeEventListener("support:open", handler);
  }, []);

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

  const visibleNav = appNavSections
    .map((section) => ({
      ...section,
      items: filterVisibleItems(section.items, user?.platformRoles ?? []),
    }))
    // Если в секции не осталось ни одного пункта (например, «Служебное»
    // для обычного пользователя без админских ролей) — секцию не показываем.
    .filter((section) => section.items.length > 0);

  return (
    <div className="app-shell" data-collapsed={collapsed ? "true" : "false"}>
      <aside
        className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}
        role="navigation"
        aria-label="Основная навигация"
      >
        <div className="sidebar-head">
          <Link className="brand" href="/news">
            <span className="brand-mark">
              <Image alt="" height={32} src="/brand/logo.webp" width={32} priority />
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
      <main className="main" id="main-content" tabIndex={-1}>
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
          {isAdminUser ? null : (
            <button
              className="icon-button"
              type="button"
              onClick={() => setSupportOpen(true)}
              title="Поддержка"
              aria-label="Открыть поддержку"
            >
              <HelpCircle size={20} />
            </button>
          )}
          <Link className="icon-button" href="/account" title="Настройки" aria-label="Открыть настройки">
            <Settings size={20} />
          </Link>
          <Link
            className={`avatar ${user?.avatarUrl ? "avatar-with-image" : ""}`}
            title={user ? `${user.firstName} ${user.lastName}` : "Войти"}
            href={user ? "/account" : "/login"}
            aria-label={user ? `Открыть профиль: ${user.firstName} ${user.lastName}` : "Войти"}
          >
            {user?.avatarUrl ? <Image alt="" src={user.avatarUrl} width={40} height={40} /> : null}
          </Link>
        </header>
        <DemoBanner user={user} pathname={pathname} />
        <div className="page-surface">{children}</div>
        <AppShellFooter />
      </main>
      {/* Drawer поддержки рендерим один раз на уровне AppShell — компонент
          сам проверяет проп `open` и ничего не рисует, пока он false. */}
      {isAdminUser ? null : <UserSupportDrawer open={supportOpen} onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function NavEntry({ item, pathname, child = false }: { item: NavItem; pathname: string; child?: boolean }) {
  const Icon = item.icon;
  const tooltipId = useId();
  const active = isActiveNavItem(item, pathname);
  const className = `nav-link ${child ? "nav-link-child" : ""} ${active ? "active" : ""} ${item.disabled ? "disabled" : ""}`;
  const iconSize = child ? 16 : 19;
  const badge = item.disabledBadge ?? COMING_SOON_BADGE;

  return (
    <div className="nav-entry">
      {item.href && !item.disabled ? (
        <Link className={className} href={item.href} title={item.label}>
          <Icon size={iconSize} />
          <span className="nav-label">{item.label}</span>
        </Link>
      ) : (
        <span
          className={className}
          title={item.disabledHint ?? item.label}
          role={item.disabled ? "link" : undefined}
          aria-disabled={item.disabled ? "true" : undefined}
          aria-describedby={item.disabled && item.disabledHint ? tooltipId : undefined}
          tabIndex={item.disabled ? 0 : undefined}
        >
          <Icon size={iconSize} />
          <span className={`nav-label ${item.disabled ? "nav-label-disabled" : ""}`}>
            <span className="nav-label-text">{item.label}</span>
            {item.disabled ? <span className="nav-disabled-badge">{badge}</span> : null}
          </span>
          {item.disabledHint ? (
            <span className="nav-tooltip" id={tooltipId} role="tooltip">
              {item.disabledHint}
            </span>
          ) : null}
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
  const prefixActive = Boolean(
    item.activePathPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)),
  );
  return selfActive || prefixActive || Boolean(item.children?.some((child) => isActiveNavItem(child, pathname)));
}

// Хлебные крошки в топбаре: ищем в навигации активный пункт и показываем
// «Категория / Пункт» (например, «Главная / Обучение»). Если ничего не нашли —
// прячем (на /login и подобных страницах AppShell всё равно не отрисуется).
function Breadcrumb({ nav, pathname }: { nav: NavSection[]; pathname: string }) {
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

// Footer внутри кабинета — даёт постоянный доступ к юридическим документам.
function AppShellFooter() {
  return (
    <footer className="app-shell-footer">
      <div className="app-shell-footer-column">
        <strong>ЭкоПлатформа</strong>
        <span>SaaS для рынка вторсырья</span>
      </div>
      <div className="app-shell-footer-column">
        <span className="app-shell-footer-title">Правовое</span>
        <Link href="/legal/privacy">Политика конфиденциальности</Link>
        <Link href="/legal/terms">Пользовательское соглашение</Link>
        <Link href="/legal/personal-data">152-ФЗ: согласие на обработку ПДн</Link>
        <Link href="/legal/cookies">Политика cookies</Link>
        <Link href="/legal/offer">Публичная оферта</Link>
      </div>
      <div className="app-shell-footer-column">
        <span className="app-shell-footer-title">Контакты</span>
        <a href="mailto:support@ecoplatform.local">support@ecoplatform.local</a>
        <span className="app-shell-footer-copyright">© 2026 ЭкоПлатформа</span>
      </div>
    </footer>
  );
}
