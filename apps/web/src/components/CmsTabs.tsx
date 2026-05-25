"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Общая подложка для всех CMS-страниц: позволяет КМ и админу
// быстро прыгать между «Новостями», «Индексами цен», «Обучением» и
// «Базой знаний». Без этой подложки на индексы/обучение можно было
// попасть только по прямому URL.
const CMS_TABS = [
  { href: "/admin/content/news", label: "Новости" },
  { href: "/admin/content/indices", label: "Индексы цен" },
  { href: "/admin/content/education", label: "Обучение" },
  { href: "/admin/content/knowledge-base", label: "База знаний" },
];

export function CmsTabs() {
  const pathname = usePathname();
  return (
    <nav className="cms-tabs" aria-label="Разделы CMS">
      {CMS_TABS.map((tab) => {
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
