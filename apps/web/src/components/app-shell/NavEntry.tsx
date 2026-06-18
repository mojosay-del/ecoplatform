"use client";

import Link from "next/link";
import { useRef } from "react";
import {
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountSectionFromHref,
  isNavItemActive,
  type AccountSectionId,
  type NavIconKey,
  type NavItem,
} from "../app-shell-nav";
import { AnimatedNavIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./nav-icons";

const DEFAULT_NAV_ICON_SIZE = 23;
const CHILD_NAV_ICON_SIZE = 20;
const NAV_ICON_SIZE_BY_KEY: Partial<Record<NavIconKey, number>> = {
  admin: 24,
  calculator: 28,
  education: 28,
  forum: 28,
  knowledge: 27,
};

export function NavEntry({
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
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);
  const accountSection = activeAccountSection ? accountSectionFromHref(item.href) : null;
  const active = accountSection ? accountSection === activeAccountSection : isNavItemActive(item, pathname);
  const className = `nav-link ${child ? "nav-link-child" : ""} ${active ? "active" : ""} ${item.disabled ? "disabled" : ""}`;
  const iconSize = child ? CHILD_NAV_ICON_SIZE : (NAV_ICON_SIZE_BY_KEY[item.icon] ?? DEFAULT_NAV_ICON_SIZE);

  return (
    <div className="nav-entry">
      {item.href && !item.disabled ? (
        <Link
          className={className}
          href={item.href}
          {...iconPlayback}
          onClick={() => {
            if (accountSection) {
              window.dispatchEvent(
                new CustomEvent(ACCOUNT_SECTION_NAVIGATE_EVENT, { detail: { section: accountSection } }),
              );
            }
          }}
          scroll={accountSection ? false : undefined}
        >
          <AnimatedNavIcon name={item.icon} ref={iconRef} size={iconSize} />
          <span className="nav-label">{item.label}</span>
        </Link>
      ) : (
        <span
          className={className}
          role={item.disabled ? "link" : undefined}
          aria-disabled={item.disabled ? "true" : undefined}
          tabIndex={item.disabled ? 0 : undefined}
        >
          <AnimatedNavIcon name={item.icon} ref={iconRef} size={iconSize} />
          <span className={`nav-label ${item.disabled ? "nav-label-disabled" : ""}`}>
            <span className="nav-label-text">{item.label}</span>
          </span>
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
