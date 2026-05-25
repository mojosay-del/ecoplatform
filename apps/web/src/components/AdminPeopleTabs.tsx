"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Общая подложка для разделов работы с людьми: Пользователи / Компании /
// Сотрудники. Раньше это были три отдельных пункта в сайдбаре, что
// засоряло навигацию. Объединили в один пункт «Пользователи» с тумблерами
// сверху — паттерн повторяет `CmsTabs` (стили `.cms-tabs` / `.cms-tab`),
// чтобы внешний вид был единым с админ-CMS.
const PEOPLE_TABS = [
  { href: "/admin/users", label: "Пользователи" },
  { href: "/admin/companies", label: "Компании" },
  { href: "/admin/staff", label: "Сотрудники" },
];

export function AdminPeopleTabs() {
  const pathname = usePathname();
  return (
    <nav className="cms-tabs" aria-label="Разделы людей">
      {PEOPLE_TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link className={`cms-tab ${active ? "active" : ""}`} href={tab.href} key={tab.href}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
