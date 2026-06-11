"use client";

// Deep-link на объявление (/marketplace/[id]) и refresh страницы. Рендерит ту же
// модалку, что и лента, поверх пустой страницы; закрытие возвращает в ленту.
// Вся разметка просмотра живёт в ListingModal — здесь только обёртка под маршрут.

import { useRouter } from "next/navigation";
import { AppShell } from "../../components/AppShell";
import { ListingModal } from "./ListingModal";

export function ListingDetailView({ id }: { id: string }) {
  const router = useRouter();
  return (
    <AppShell>
      <section className="page mp-page-wide">
        <ListingModal listingId={id} onClose={() => router.push("/marketplace")} />
      </section>
    </AppShell>
  );
}
