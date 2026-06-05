"use client";

import Link from "next/link";
import { useId } from "react";
import {
  ACCOUNT_SECTION_NAVIGATE_EVENT,
  accountSectionFromHref,
  isNavItemActive,
  type AccountSectionId,
  type NavItem,
} from "../app-shell-nav";

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
