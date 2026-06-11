"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
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
} from "../app-shell-nav";

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
        onClick={() => setOpen((value) => !value)}
      >
        <Settings size={20} />
      </button>
      {open ? (
        <div className="account-menu-popover" role="menu" aria-label="Меню аккаунта">
          <header className="account-menu-head">
            <span className={`avatar account-menu-head-avatar ${user?.avatarUrl ? "avatar-with-image" : ""}`}>
              {user?.avatarUrl ? (
                <Image alt="" src={user.avatarUrl} width={40} height={40} />
              ) : (
                <UserRound size={20} aria-hidden="true" />
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
                const Icon = item.icon;
                const accountSection = activeAccountSection ? accountSectionFromHref(item.href) : null;
                const accountModal = accountProfileModalFromHref(item.href);
                const active = accountModal
                  ? accountModal === activeAccountModal
                  : accountSection
                    ? accountSection === activeAccountSection && !activeAccountModal
                    : isNavItemActive(item, pathname);
                return item.href ? (
                  <Link
                    className={`account-menu-link ${active ? "active" : ""}`}
                    href={item.href}
                    key={item.href}
                    onClick={() => {
                      setOpen(false);
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
