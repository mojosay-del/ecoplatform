"use client";

// Торговая площадка — публичная лента объявлений о продаже вторсырья.
// Этап фундамента: раздел открывается только администраторам (строится «за
// закрытыми дверьми»), лента пока пустая. На фазе объявлений здесь появятся
// карточки, фильтры (сырьё/регион), карта и сортировка.

import type { MarketplaceListingListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";

export function MarketplaceView() {
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery("marketplace-listings", () => api.marketplace.listings({ limit: 50 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<MarketplaceListingListItem>);
  const listings = page.items;

  if (state === "unauthenticated") {
    return <AuthRequired title="Торговая площадка" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Торговая площадка" />;
  }

  if (state === "error") {
    return <ErrorState title="Торговая площадка" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader
          title="Торговая площадка"
          subtitle="Объявления о продаже вторсырья от заготовителей."
        />
        {state === "loading" ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка объявлений…
          </p>
        ) : listings.length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Раздел в разработке. Опубликованных объявлений пока нет.
          </p>
        ) : (
          <ul className="marketplace-listings">
            {listings.map((listing) => (
              <li key={listing.id} className="marketplace-listing-stub">
                {[listing.city, listing.region].filter(Boolean).join(", ")} ·{" "}
                {listing.positions.map((position) => position.nomenclatureName).join(", ")}
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
