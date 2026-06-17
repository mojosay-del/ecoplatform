"use client";

import Link from "next/link";
import { useId, useRef } from "react";
import {
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountSectionFromHref,
  isNavItemActive,
  type AccountSectionId,
  type NavIconKey,
  type NavItem,
} from "../app-shell-nav";
import { AnimatedNavIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./nav-icons";

const DEFAULT_NAV_ICON_SIZE = 21;
const CHILD_NAV_ICON_SIZE = 18;
const NAV_ICON_SIZE_BY_KEY: Partial<Record<NavIconKey, number>> = {
  admin: 22,
  calculator: 26,
  education: 26,
  forum: 26,
  knowledge: 25,
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
  const tooltipId = useId();
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
          title={item.label}
        >
          <AnimatedNavIcon name={item.icon} ref={iconRef} size={iconSize} />
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
          <AnimatedNavIcon name={item.icon} ref={iconRef} size={iconSize} />
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
