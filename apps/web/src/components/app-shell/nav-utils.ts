import { isMemberSectionKey, type AuthMeFeatures, type CompanyType } from "@ecoplatform/shared";
import type { NavItem, NavSection } from "../app-shell-nav";

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

// Заблокирован ли текущий путь для сотрудника (member): переход по прямой ссылке
// в раздел, который владелец ему не открыл. Скрытие в меню (filterVisibleItems)
// — только визуальное; этот guard в AppShell не пускает member'а на страницу.
// memberSections null/undefined = владелец: доступ полный, не блокируем.
export function isMemberSectionBlocked(
  sections: NavSection[],
  pathname: string,
  memberSections: string[] | null | undefined,
): boolean {
  if (!memberSections) return false;
  for (const section of sections) {
    for (const item of section.items) {
      if (item.href && (pathname === item.href || pathname.startsWith(`${item.href}/`))) {
        return Boolean(item.key && isMemberSectionKey(item.key) && !memberSections.includes(item.key));
      }
    }
  }
  return false;
}
