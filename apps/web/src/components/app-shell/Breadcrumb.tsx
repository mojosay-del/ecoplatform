import Link from "next/link";
import { getBreadcrumbTrail, type BreadcrumbItem, type NavSection } from "../app-shell-nav";

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
