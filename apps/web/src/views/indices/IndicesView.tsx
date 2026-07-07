"use client";

// Раздел «Индексы цен». Вынесен из DataViews.tsx как изолированный модуль:
// у IndicesView нет общих state/хелперов с лентой новостей или базой знаний,
// поэтому он жил в монолите только из-за лени.

import { useMemo } from "react";
import type { NomenclatureListItem, PaginatedResponse } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { getIndexMarketPulse } from "../index-movement-summary";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { formatIndexUpdatedDate } from "./format";
import { IndexCard } from "./IndexCard";
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
  } as PaginatedResponse<NomenclatureListItem>);
  const data = page.items;

  // Дата последнего обновления по всему рынку — из недельного пульса.
  const lastUpdated = useMemo(() => {
    const pulse = getIndexMarketPulse(data);
    return pulse.lastUpdated ? formatIndexUpdatedDate(pulse.lastUpdated) : "";
  }, [data]);

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
        <header className="indices-header">
          <p className="page-hero-eyebrow">Пульс рынка</p>
          <h1 className="indices-title">Индексы цен на вторсырьё</h1>
          <p className="indices-subtitle">Актуальные ценовые индексы по основным видам сырья.</p>
          {lastUpdated ? (
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
              обновлено {lastUpdated}
            </span>
          ) : null}
        </header>
        {state === "loading" ? (
          <IndicesLoadingShell />
        ) : data.length === 0 ? (
          <p className="page-subtitle u-text-center u-py-60">Пока нет опубликованных индексов.</p>
        ) : (
          <>
            <IndexMarketPulse items={data} />
            <IndexMovementSummaryTable items={data} />
            <div className="indices-grid">
              {data.map((item) => (
                <IndexCard key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

function IndicesLoadingShell() {
  return (
    <div className="indices-loading-shell" aria-busy="true" aria-hidden="true">
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
