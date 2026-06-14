"use client";

// Раздел «Индексы цен». Вынесен из DataViews.tsx как изолированный модуль:
// у IndicesView нет общих state/хелперов с лентой новостей или базой знаний,
// поэтому он жил в монолите только из-за лени.

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { NomenclatureCategoryListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { getIndexMarketPulse } from "../index-movement-summary";
import { materialColor } from "../marketplace/materials";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { formatIndexUpdatedDate } from "./format";
import { IndexCard } from "./IndexCard";
import { IndexCombinedChart } from "./IndexCombinedChart";
import { IndexMarketPulse } from "./IndexMarketPulse";
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

  useEffect(() => {
    if (!activeSlug && data[0]?.slug) {
      setActiveSlug(data[0].slug);
    }
  }, [data, activeSlug]);

  // Счётчики ↑/↓ на вкладках категорий и дата обновления активной категории —
  // из недельного пульса (по summary.trend, как чипы карточек).
  const categoryPulse = useMemo(() => {
    const map = new Map<string, { up: number; down: number }>();
    for (const category of data) {
      const pulse = getIndexMarketPulse(category.nomenclatures ?? []);
      map.set(category.id, { up: pulse.risingCount, down: pulse.fallingCount });
    }
    return map;
  }, [data]);

  const activeUpdated = useMemo(() => {
    if (!active) return "";
    const pulse = getIndexMarketPulse(active.nomenclatures ?? []);
    return pulse.lastUpdated ? formatIndexUpdatedDate(pulse.lastUpdated) : "";
  }, [active]);

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
        <div className="indices-header">
          <PageHeader
            title="Индексы цен на вторсырьё"
            subtitle="Актуальные ценовые индексы по основным категориям сырья."
          />
          {activeUpdated ? (
            <span className="indices-updated-pill">
              <svg className="indices-updated-icon" width="13" height="13" viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M8 4.6 V8 L10.4 9.4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              обновлено {activeUpdated}
            </span>
          ) : null}
        </div>
        {state === "loading" ? (
          <IndicesLoadingShell />
        ) : (
          <>
            <div className="indices-categories">
              {data.map((category) => {
                const counts = categoryPulse.get(category.id);
                const isActive = category.slug === active?.slug;
                const color = materialColor(category.slug);
                return (
                  <button
                    aria-label={
                      counts ? `${category.name}: ${counts.up} растут, ${counts.down} снижаются` : category.name
                    }
                    className={`indices-category-tab ${isActive ? "active" : ""}`}
                    key={category.id}
                    onClick={() => setActiveSlug(category.slug)}
                    style={{ "--cat-color": color } as CSSProperties}
                    type="button"
                  >
                    <span className="indices-category-dot" aria-hidden="true" />
                    <span className="indices-category-name">{category.name}</span>
                    {counts && (counts.up > 0 || counts.down > 0) ? (
                      <span className="indices-category-counts index-num" aria-hidden="true">
                        {counts.up > 0 ? <span className="up">{counts.up}↑</span> : null}
                        {counts.down > 0 ? <span className="down">{counts.down}↓</span> : null}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            {!active || (active.nomenclatures ?? []).length === 0 ? (
              <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
                В этой категории пока нет опубликованных индексов.
              </p>
            ) : (
              <>
                <IndexMarketPulse items={active.nomenclatures} categorySlug={active.slug} categoryName={active.name} />
                <IndexMovementSummaryTable items={active.nomenclatures} />
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
          </>
        )}
      </section>
    </AppShell>
  );
}

function IndicesLoadingShell() {
  return (
    <div className="indices-loading-shell" aria-busy="true" aria-hidden="true">
      <div className="indices-categories">
        {Array.from({ length: 4 }).map((_, index) => (
          <span className="indices-category-tab-skeleton" key={index} />
        ))}
      </div>
      <div className="index-pulse">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="index-pulse-card index-pulse-skeleton" key={index} />
        ))}
      </div>
      <div className="index-movement-summary">
        <div className="index-movement-head">
          <div className="index-movement-title indices-loading-title">
            <div className="page-skeleton-bar w-1-2" />
            <div className="page-skeleton-bar w-3-4" />
          </div>
          <div className="indices-loading-periods" />
        </div>
        <div className="indices-loading-table" />
      </div>
      <div className="indices-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <article className="index-card" key={index}>
            <div className="page-skeleton-bar w-3-4" />
            <div className="page-skeleton-bar w-1-2" />
            <div className="indices-loading-chart" />
            <div className="indices-loading-periods" />
          </article>
        ))}
      </div>
    </div>
  );
}
