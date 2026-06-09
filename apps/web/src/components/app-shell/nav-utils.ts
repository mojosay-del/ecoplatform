import type { CompanyType } from "@ecoplatform/shared";
import type { NavItem } from "../app-shell-nav";

export type NavAccessContext = {
  roles: readonly string[];
  companyType?: CompanyType | null;
};

export function filterVisibleItems(items: NavItem[], access: NavAccessContext): NavItem[] {
  return items
    .filter((item) => isNavItemVisible(item, access))
    .map((item) => ({
      ...item,
      children: item.children ? filterVisibleItems(item.children, access) : undefined,
    }));
}

function isNavItemVisible(item: NavItem, access: NavAccessContext): boolean {
  if (item.roles && !item.roles.some((role) => access.roles.includes(role))) {
    return false;
  }

  if (item.companyTypes && access.roles.length === 0) {
    if (!access.companyType || !item.companyTypes.includes(access.companyType)) {
      return false;
    }
  }

  return true;
}
