"use client";

// Раздел «Индексы цен». Вынесен из DataViews.tsx как изолированный модуль:
// у IndicesView нет общих state/хелперов с лентой новостей или базой знаний,
// поэтому он жил в монолите только из-за лени.

import { useEffect, useMemo, useState } from "react";
import type { NomenclatureCategoryListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { getIndexMovementSummary } from "../index-movement-summary";
import { IndexCard } from "./IndexCard";
import { IndexCombinedChart } from "./IndexCombinedChart";
import { IndexMovementSummaryTable } from "./IndexMovementSummaryTable";

export function IndicesView() {
  const {
    data: page,
    state,
    errorMessage,
  } = useApiQuery("indices", () => api.indices.list({ limit: 100 }), {
    items: [],
    total: 0,
    hasMore: false,
  } as PaginatedResponse<NomenclatureCategoryListItem>);
  const data = page.items;
  const [activeSlug, setActiveSlug] = useState<string | undefined>(undefined);
  const active = data.find((category) => category.slug === activeSlug) ?? data[0];
  const movementSummary = useMemo(() => getIndexMovementSummary(active?.nomenclatures ?? []), [active?.nomenclatures]);

  useEffect(() => {
    if (!activeSlug && data[0]?.slug) {
      setActiveSlug(data[0].slug);
    }
  }, [data, activeSlug]);

  if (state === "unauthenticated") {
    return <AuthRequired title="Индексы цен" />;
  }

  if (state === "forbidden") {
    return <AccessClosed title="Индексы цен" />;
  }

  if (state === "error") {
    return <ErrorState title="Индексы цен" message={errorMessage} />;
  }

  return (
    <AppShell>
      <section className="page">
        <PageHeader
          title="Индексы цен на вторсырьё"
          subtitle="Актуальные ценовые индексы по основным категориям сырья."
        />
        <div className="indices-categories">
          {data.map((category) => (
            <button
              className={`indices-category-tab ${category.slug === active?.slug ? "active" : ""}`}
              onClick={() => setActiveSlug(category.slug)}
              key={category.id}
              type="button"
            >
              {category.name}
            </button>
          ))}
        </div>
        {!active || (active.nomenclatures ?? []).length === 0 ? (
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            В этой категории пока нет опубликованных индексов.
          </p>
        ) : (
          <>
            <IndexMovementSummaryTable summary={movementSummary} />
            {active.nomenclatures.length >= 2 ? (
              <IndexCombinedChart nomenclatures={active.nomenclatures} categoryName={active.name} />
            ) : null}
            <div className="indices-grid">
              {active.nomenclatures.map((item) => (
                <IndexCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
