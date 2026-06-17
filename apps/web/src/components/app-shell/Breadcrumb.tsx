import Link from "next/link";
import { useRef } from "react";
import { getBreadcrumbTrail, type BreadcrumbItem, type NavSection } from "../app-shell-nav";
import { AnimatedNavIcon, type AnimatedNavIconHandle, useAnimatedNavIconPlayback } from "./nav-icons";

// Хлебные крошки в топбаре: для обычных разделов берём активный пункт меню,
// а для админки показываем вложенный путь внутри единой панели управления.
export function Breadcrumb({
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
  const iconRef = useRef<AnimatedNavIconHandle | null>(null);
  const iconPlayback = useAnimatedNavIconPlayback(iconRef);
  const AnimatedIcon = typeof crumb.icon === "string" ? crumb.icon : null;
  const StaticIcon = typeof crumb.icon === "function" ? crumb.icon : null;
  const content = (
    <>
      {AnimatedIcon ? <AnimatedNavIcon name={AnimatedIcon} ref={iconRef} size={17} /> : null}
      {StaticIcon ? <StaticIcon size={17} /> : null}
      <span>{crumb.label}</span>
    </>
  );

  return (
    <>
      {crumb.href && !current ? (
        <Link className="topbar-breadcrumb-link" href={crumb.href} {...iconPlayback}>
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
