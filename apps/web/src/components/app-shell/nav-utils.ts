import { isMemberSectionKey, type AuthMeFeatures, type CompanyType } from "@ecoplatform/shared";
import type { NavItem } from "../app-shell-nav";

export type NavAccessContext = {
  roles: readonly string[];
  companyType?: CompanyType | null;
  features?: AuthMeFeatures;
  // Разрешённые сотруднику разделы (ключи). null/undefined — владелец: доступ
  // полный, по разделам не режем.
  memberSections?: string[] | null;
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
  if (item.feature && !access.features?.[item.feature]) {
    return false;
  }

  if (item.roles && !item.roles.some((role) => access.roles.includes(role))) {
    return false;
  }

  if (item.companyTypes && access.roles.length === 0) {
    if (!access.companyType || !item.companyTypes.includes(access.companyType)) {
      return false;
    }
  }

  // Сотрудник (member): среди гейтируемых разделов показываем только те, что
  // разрешил владелец. Не-разделы (админка, будущие пункты) не трогаем.
  if (access.memberSections && item.key && isMemberSectionKey(item.key)) {
    if (!access.memberSections.includes(item.key)) {
      return false;
    }
  }

  return true;
}
