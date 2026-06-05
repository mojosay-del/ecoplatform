import Image from "next/image";
import Link from "next/link";
import { ChevronsLeft, ChevronsRight, X } from "lucide-react";
import type { AccountSectionId, NavSection } from "../app-shell-nav";
import { NavEntry } from "./NavEntry";

export function AppSidebar({
  activeAccountSection,
  collapsed,
  mobileNavOpen,
  onCloseMobileNav,
  onToggleCollapsed,
  pathname,
  visibleNav,
}: {
  activeAccountSection: AccountSectionId | null;
  collapsed: boolean;
  mobileNavOpen: boolean;
  onCloseMobileNav: () => void;
  onToggleCollapsed: () => void;
  pathname: string;
  visibleNav: NavSection[];
}) {
  return (
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
        <button className="sidebar-close" type="button" onClick={onCloseMobileNav} aria-label="Закрыть меню">
          <X size={20} />
        </button>
        <button
          className="sidebar-collapse"
          type="button"
          onClick={onToggleCollapsed}
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
  );
}
