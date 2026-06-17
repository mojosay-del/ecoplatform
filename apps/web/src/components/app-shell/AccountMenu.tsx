"use client";

import Image from "next/image";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { User } from "../../lib/auth";
import {
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountProfileModalFromHref,
  accountSectionFromHref,
  getAccountMenuSections,
  isNavItemActive,
  type AccountProfileModalId,
  type AccountSectionId,
  type NavItem,
} from "../app-shell-nav";
import { AnimatedNavIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./nav-icons";

export function AccountMenu({
  activeAccountSection,
  activeAccountModal,
  includeBusiness,
  onLogout,
  pathname,
  searchKey,
  user,
}: {
  activeAccountSection: AccountSectionId | null;
  activeAccountModal: AccountProfileModalId | null;
  includeBusiness: boolean;
  onLogout: () => Promise<void>;
  pathname: string;
  searchKey: string;
  user: User | null;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const settingsIconRef = useRef<AnimatedNavIconHandle | null>(null);
  const settingsIconPlayback = useAnimatedNavIconPlayback(settingsIconRef);
  const [open, setOpen] = useState(false);
  const sections = getAccountMenuSections(includeBusiness);
  const fullName = user ? `${user.firstName} ${user.lastName}` : "Аккаунт";

  useEffect(() => {
    setOpen(false);
  }, [pathname, searchKey]);

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
        {...settingsIconPlayback}
        onClick={() => setOpen((value) => !value)}
      >
        <AnimatedNavIcon name="settings" ref={settingsIconRef} size={25} />
      </button>
      {open ? (
        <div className="account-menu-popover" role="menu" aria-label="Меню аккаунта">
          <header className="account-menu-head">
            <span className={`avatar account-menu-head-avatar ${user?.avatarUrl ? "avatar-with-image" : ""}`}>
              {user?.avatarUrl ? (
                <Image alt="" src={user.avatarUrl} width={40} height={40} />
              ) : (
                <UserRound size={22} aria-hidden="true" />
              )}
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
                const accountSection = activeAccountSection ? accountSectionFromHref(item.href) : null;
                const accountModal = accountProfileModalFromHref(item.href);
                const active = accountModal
                  ? accountModal === activeAccountModal
                  : accountSection
                    ? accountSection === activeAccountSection && !activeAccountModal
                    : isNavItemActive(item, pathname);
                return (
                  <AccountMenuLink
                    accountSection={accountSection}
                    active={active}
                    item={item}
                    key={item.href}
                    onClose={() => setOpen(false)}
                  />
                );
              })}
            </div>
          ))}
          <AccountMenuLogout onLogout={onLogout} />
        </div>
      ) : null}
    </div>
  );
}

function AccountMenuLink({
  accountSection,
  active,
  item,
  onClose,
}: {
  accountSection: AccountSectionId | null;
  active: boolean;
  item: NavItem;
  onClose: () => void;
}) {
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);

  if (!item.href) return null;

  return (
    <Link
      className={`account-menu-link ${active ? "active" : ""}`}
      href={item.href}
      {...iconPlayback}
      onClick={() => {
        onClose();
        if (accountSection) {
          window.dispatchEvent(
            new CustomEvent(ACCOUNT_SECTION_NAVIGATE_EVENT, { detail: { section: accountSection } }),
          );
        }
      }}
      role="menuitem"
      scroll={accountSection ? false : undefined}
    >
      <AnimatedNavIcon name={item.icon} ref={iconRef} size={22} />
      <span>{item.label}</span>
    </Link>
  );
}

function AccountMenuLogout({ onLogout }: { onLogout: () => Promise<void> }) {
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);

  return (
    <button
      className="account-menu-logout"
      type="button"
      {...iconPlayback}
      onClick={() => void onLogout()}
      role="menuitem"
    >
      <AnimatedNavIcon name="logout" ref={iconRef} size={22} />
      <span>Выйти</span>
    </button>
  );
}
