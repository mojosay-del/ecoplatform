"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu } from "lucide-react";
import type { BillingStatus } from "@ecoplatform/shared";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { isSubscriptionSelectionRequired } from "../lib/subscription-access";
import { useApiQuery } from "../views/shared/use-api-query";
import { SubscriptionDialog } from "../views/account/SubscriptionDialog";
import {
  AccountMenu,
  AppShellFooter,
  AppSidebar,
  Breadcrumb,
  filterVisibleItems,
  type AppShellChrome,
} from "./app-shell";
import {
  ACCOUNT_SECTION_CHANGE_EVENT,
  accountSectionFromHref,
  appNavSections,
  isAccountPath,
  normalizeAccountProfileModal,
  type AccountSectionId,
} from "./app-shell-nav";
import { DemoBanner } from "./DemoBanner";
import { NotificationBell } from "./NotificationBell";
import { UserSupportDrawer } from "./UserSupportDrawer";
import { SupportTopbarIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./app-shell/nav-icons";

export type { AppShellChrome };

export function AppShell({ children, chrome = {} }: { children: ReactNode; chrome?: AppShellChrome }) {
  return (
    <Suspense fallback={null}>
      <AppShellContent chrome={chrome}>{children}</AppShellContent>
    </Suspense>
  );
}

function AppShellContent({ children, chrome }: { children: ReactNode; chrome: AppShellChrome }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, ready, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [activeAccountSection, setActiveAccountSection] = useState<AccountSectionId | null>(null);
  const supportIconRef = useRef<AnimatedNavIconHandle | null>(null);
  const supportIconPlayback = useAnimatedNavIconPlayback(supportIconRef);
  // У админов своя полноценная страница /admin/support — drawer им
  // показывать не нужно, иначе двойная сущность.
  const isAdminUser = (user?.platformRoles?.length ?? 0) > 0;
  const inAccountSettings = isAccountPath(pathname);
  const activeAccountModal = inAccountSettings ? normalizeAccountProfileModal(searchParams.get("modal")) : null;
  const showSidebar = chrome.sidebar !== false;
  const showBreadcrumbs = chrome.breadcrumbs !== false;
  const showNotifications = chrome.notifications !== false;
  const showDemoBanner = chrome.demoBanner !== false;
  const showAdminPanelBackLink = chrome.adminBackLink !== false && pathname.startsWith("/admin/");
  const subscriptionGateRequired = !isAdminUser && isSubscriptionSelectionRequired(user?.company);
  const {
    data: subscriptionGateBilling,
    setData: setSubscriptionGateBilling,
    state: subscriptionGateBillingState,
  } = useApiQuery<BillingStatus | null>(
    subscriptionGateRequired ? `billing-status:gate:${user?.company?.id ?? "company"}` : null,
    () => api.billing.status(),
    null,
  );

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
      items: filterVisibleItems(section.items, {
        roles: user?.platformRoles ?? [],
        companyType: user?.company?.type ?? null,
        features: user?.features,
      }),
    }))
    // Если в секции не осталось ни одного пункта (например, «Служебное»
    // для обычного пользователя без админских ролей) — секцию не показываем.
    .filter((section) => section.items.length > 0);
  const visibleNav = visibleAppNav;

  return (
    <div
      className={`app-shell${showSidebar ? "" : " app-shell-no-sidebar"}${subscriptionGateRequired ? " is-subscription-gated" : ""}`}
      data-collapsed={collapsed ? "true" : "false"}
    >
      {showSidebar ? (
        <AppSidebar
          activeAccountSection={activeAccountSection}
          collapsed={collapsed}
          mobileNavOpen={mobileNavOpen}
          onCloseMobileNav={() => setMobileNavOpen(false)}
          onToggleCollapsed={toggleCollapsed}
          pathname={pathname}
          visibleNav={visibleNav}
        />
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
          {showSidebar && chrome.mobileTopbarAction ? (
            <div className="topbar-mobile-action">{chrome.mobileTopbarAction}</div>
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
              {...supportIconPlayback}
            >
              <SupportTopbarIcon ref={supportIconRef} size={27} />
            </button>
          )}
          <AccountMenu
            activeAccountSection={activeAccountSection}
            activeAccountModal={activeAccountModal}
            includeBusiness={!isAdminUser}
            onLogout={logout}
            pathname={pathname}
            searchKey={searchParams.toString()}
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
      {subscriptionGateRequired ? (
        <SubscriptionDialog
          billing={subscriptionGateBilling}
          billingState={subscriptionGateBillingState}
          closeDisabled
          onBillingUpdated={setSubscriptionGateBilling}
          onClose={() => undefined}
          onGateSatisfied={() => undefined}
          onOpenSupport={() => setSupportOpen(true)}
        />
      ) : null}
    </div>
  );
}
