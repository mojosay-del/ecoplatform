"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronsLeft, ChevronsRight, HelpCircle, LogOut, Menu, Settings, X } from "lucide-react";
import { useAuth, type User } from "../lib/auth";
import { SUPPORT_EMAIL } from "../lib/platform-contact";
import {
  ACCOUNT_SECTION_CHANGE_EVENT,
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountSectionFromHref,
  appNavSections,
  getAccountMenuSections,
  getBreadcrumbTrail,
  isAccountPath,
  isNavItemActive,
  type BreadcrumbItem,
  type AccountSectionId,
  type NavItem,
  type NavSection,
} from "./app-shell-nav";
import { DemoBanner } from "./DemoBanner";
import { NotificationBell } from "./NotificationBell";
import { UserSupportDrawer } from "./UserSupportDrawer";

type AppShellChrome = {
  sidebar?: boolean;
  breadcrumbs?: boolean;
  breadcrumbTrail?: BreadcrumbItem[];
  notifications?: boolean;
  demoBanner?: boolean;
  adminBackLink?: boolean;
};

export function AppShell({ children, chrome = {} }: { children: React.ReactNode; chrome?: AppShellChrome }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, ready, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [activeAccountSection, setActiveAccountSection] = useState<AccountSectionId | null>(null);
  // У админов своя полноценная страница /admin/support — drawer им
  // показывать не нужно, иначе двойная сущность.
  const isAdminUser = (user?.platformRoles?.length ?? 0) > 0;
  const inAccountSettings = isAccountPath(pathname);
  const showSidebar = chrome.sidebar !== false;
  const showBreadcrumbs = chrome.breadcrumbs !== false;
  const showNotifications = chrome.notifications !== false;
  const showDemoBanner = chrome.demoBanner !== false;
  const showAdminPanelBackLink = chrome.adminBackLink !== false && pathname.startsWith("/admin/");

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
    if (!inAccountSettings) {
      setActiveAccountSection(null);
      return;
    }
    setActiveAccountSection(accountSectionFromHref(pathname));
  }, [inAccountSettings, pathname]);

  useEffect(() => {
    if (!inAccountSettings) return;

    function onAccountSectionChange(event: Event) {
      const section = (event as CustomEvent<{ section?: AccountSectionId }>).detail?.section;
      if (section) setActiveAccountSection(section);
    }

    window.addEventListener(ACCOUNT_SECTION_CHANGE_EVENT, onAccountSectionChange);
    return () => window.removeEventListener(ACCOUNT_SECTION_CHANGE_EVENT, onAccountSectionChange);
  }, [inAccountSettings]);

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

  const visibleAppNav = appNavSections
    .map((section) => ({
      ...section,
      items: filterVisibleItems(section.items, user?.platformRoles ?? []),
    }))
    // Если в секции не осталось ни одного пункта (например, «Служебное»
    // для обычного пользователя без админских ролей) — секцию не показываем.
    .filter((section) => section.items.length > 0);
  const visibleNav = visibleAppNav;

  return (
    <div
      className={`app-shell${showSidebar ? "" : " app-shell-no-sidebar"}`}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {showSidebar ? (
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
                <NavEntry
                  activeAccountSection={activeAccountSection}
                  item={item}
                  key={item.href ?? item.label}
                  pathname={pathname}
                />
              ))}
            </nav>
          ))}
        </aside>
      ) : null}
      {showSidebar && mobileNavOpen ? (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      ) : null}
      <main className="main" id="main-content" tabIndex={-1}>
        <header className="topbar">
          {showSidebar ? (
            <button
              className="icon-button mobile-menu-button"
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Открыть меню"
            >
              <Menu size={20} />
            </button>
          ) : null}
          {!showSidebar ? (
            <Link className="topbar-brand" href="/news" title="ЭкоПлатформа">
              <Image alt="" height={30} src="/brand/logo.webp" width={30} priority />
              <span>ЭкоПлатформа</span>
            </Link>
          ) : null}
          {showBreadcrumbs ? <Breadcrumb nav={visibleNav} pathname={pathname} trail={chrome.breadcrumbTrail} /> : null}
          <div className="topbar-spacer" />
          {showDemoBanner ? <DemoBanner user={user} pathname={pathname} /> : null}
          {showNotifications ? <NotificationBell /> : null}
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
          <AccountMenu
            activeAccountSection={activeAccountSection}
            includeBusiness={!isAdminUser}
            onLogout={logout}
            pathname={pathname}
            user={user}
          />
        </header>
        <div className="page-surface">
          {showAdminPanelBackLink ? (
            <Link className="button ghost admin-panel-back-link" href="/admin">
              ← Панель управления
            </Link>
          ) : null}
          {children}
        </div>
      </main>
      <AppShellFooter />
      {/* Drawer поддержки рендерим один раз на уровне AppShell — компонент
          сам проверяет проп `open` и ничего не рисует, пока он false. */}
      {isAdminUser ? null : <UserSupportDrawer open={supportOpen} onClose={() => setSupportOpen(false)} />}
    </div>
  );
}

function AccountMenu({
  activeAccountSection,
  includeBusiness,
  onLogout,
  pathname,
  user,
}: {
  activeAccountSection: AccountSectionId | null;
  includeBusiness: boolean;
  onLogout: () => Promise<void>;
  pathname: string;
  user: User | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const sections = getAccountMenuSections(includeBusiness);
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Аккаунт";
  const initials = user ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() : "";

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onDocumentMouseDown(event: MouseEvent) {
      if (!rootRef.current || rootRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div className="account-menu-root" ref={rootRef}>
      <button
        className="icon-button"
        type="button"
        title="Настройки аккаунта"
        aria-label="Открыть настройки аккаунта"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={20} />
      </button>
      {open ? (
        <div className="account-menu-popover" role="menu" aria-label="Меню аккаунта">
          <header className="account-menu-head">
            <span className={`avatar account-menu-head-avatar ${user?.avatarUrl ? "avatar-with-image" : ""}`}>
              {user?.avatarUrl ? <Image alt="" src={user.avatarUrl} width={40} height={40} /> : null}
              {!user?.avatarUrl ? <span className="account-menu-avatar-initials">{initials || "?"}</span> : null}
            </span>
            <span className="account-menu-head-text">
              <strong>{fullName}</strong>
              {user?.email ? <span className="account-menu-head-email">{user.email}</span> : null}
            </span>
          </header>
          {sections.map((section) => (
            <div className="account-menu-section" key={section.title}>
              <p>{section.title}</p>
              {section.items.map((item) => {
                const Icon = item.icon;
                const accountSection = activeAccountSection ? accountSectionFromHref(item.href) : null;
                const active = accountSection
                  ? accountSection === activeAccountSection
                  : isNavItemActive(item, pathname);
                return item.href ? (
                  <Link
                    className={`account-menu-link ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => {
                      if (accountSection) {
                        window.dispatchEvent(
                          new CustomEvent(ACCOUNT_SECTION_NAVIGATE_EVENT, { detail: { section: accountSection } }),
                        );
                      }
                    }}
                    role="menuitem"
                    scroll={accountSection ? false : undefined}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </Link>
                ) : null;
              })}
            </div>
          ))}
          <button className="account-menu-logout" type="button" onClick={() => void onLogout()} role="menuitem">
            <LogOut size={16} />
            <span>Выйти</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NavEntry({
  activeAccountSection,
  item,
  pathname,
  child = false,
}: {
  activeAccountSection: AccountSectionId | null;
  item: NavItem;
  pathname: string;
  child?: boolean;
}) {
  const Icon = item.icon;
  const tooltipId = useId();
  const accountSection = activeAccountSection ? accountSectionFromHref(item.href) : null;
  const active = accountSection ? accountSection === activeAccountSection : isNavItemActive(item, pathname);
  const className = `nav-link ${child ? "nav-link-child" : ""} ${active ? "active" : ""} ${item.disabled ? "disabled" : ""}`;
  const iconSize = child ? 16 : 19;

  return (
    <div className="nav-entry">
      {item.href && !item.disabled ? (
        <Link
          className={className}
          href={item.href}
          onClick={() => {
            if (accountSection) {
              window.dispatchEvent(
                new CustomEvent(ACCOUNT_SECTION_NAVIGATE_EVENT, { detail: { section: accountSection } }),
              );
            }
          }}
          scroll={accountSection ? false : undefined}
          title={item.label}
        >
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
            <NavEntry
              activeAccountSection={activeAccountSection}
              child
              item={childItem}
              key={childItem.href ?? childItem.label}
              pathname={pathname}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Хлебные крошки в топбаре: для обычных разделов берём активный пункт меню,
// а для админки показываем вложенный путь внутри единой панели управления.
function Breadcrumb({
  nav,
  pathname,
  trail: customTrail,
}: {
  nav: NavSection[];
  pathname: string;
  trail?: BreadcrumbItem[];
}) {
  const trail = customTrail ?? getBreadcrumbTrail(nav, pathname);
  if (!trail) return null;

  return (
    <nav className="topbar-breadcrumb" aria-label="Хлебные крошки">
      {trail.map((crumb, index) => (
        <BreadcrumbCrumb crumb={crumb} current={index === trail.length - 1} key={`${crumb.label}-${index}`} />
      ))}
    </nav>
  );
}

function BreadcrumbCrumb({ crumb, current }: { crumb: BreadcrumbItem; current: boolean }) {
  const Icon = crumb.icon;
  const content = (
    <>
      {Icon ? <Icon size={15} /> : null}
      <span>{crumb.label}</span>
    </>
  );

  return (
    <>
      {crumb.href && !current ? (
        <Link className="topbar-breadcrumb-link" href={crumb.href}>
          {content}
        </Link>
      ) : (
        <span
          className={current ? "topbar-breadcrumb-current" : "topbar-breadcrumb-section"}
          aria-current={current ? "page" : undefined}
        >
          {content}
        </span>
      )}
      {current ? null : (
        <span className="topbar-breadcrumb-sep" aria-hidden>
          /
        </span>
      )}
    </>
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
      <strong>ЭкоПлатформа</strong>
      <span>SaaS для рынка вторсырья</span>
      <span className="app-shell-footer-separator" aria-hidden="true" />
      <nav className="app-shell-footer-links" aria-label="Правовая информация">
        <Link href="/legal/privacy">Политика конфиденциальности</Link>
        <Link href="/legal/terms">Пользовательское соглашение</Link>
        <Link href="/legal/personal-data">Согласие на обработку ПДн</Link>
        <Link href="/legal/cookies">Cookies</Link>
        <Link href="/legal/offer">Оферта</Link>
      </nav>
      <span className="app-shell-footer-separator" aria-hidden="true" />
      <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
      <span className="app-shell-footer-copyright">© 2026</span>
    </footer>
  );
}
