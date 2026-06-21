"use client";

import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import "../../content-blocks/checklist.css";
import { AdminCompanyDetailPanel } from "./company-detail-panel";
import { AdminCompaniesTable } from "./companies-table";
import { AdminCompaniesFilterBar } from "./filter-bar";
import { useAdminCompanies } from "./use-admin-companies";

export function AdminCompaniesView() {
  const view = useAdminCompanies();
  const { companiesQuery } = view;

  if (!view.token || companiesQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (companiesQuery.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Компании</h1>
          <p className="page-subtitle">Управление компаниями и их подписками.</p>
        </header>

        <AdminCompaniesFilterBar
          search={view.search}
          statusFilter={view.statusFilter}
          planFilter={view.planFilter}
          onPlanChange={view.setPlanFilter}
          onReset={view.resetFilters}
          onSearchChange={view.setSearch}
          onStatusChange={view.setStatusFilter}
          onSubmit={view.applyFilters}
        />

        {view.errorMessage || companiesQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {view.errorMessage ?? companiesQuery.errorMessage}
          </StatusPill>
        ) : null}
        {companiesQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        {companiesQuery.state === "ready" || companiesQuery.items.length > 0 ? (
          <div className="moderation-layout admin-master-detail">
            <div className="admin-table-shell">
              <div className="admin-table-meta">
                <p className="page-subtitle">
                  Загружено {companiesQuery.items.length} из {companiesQuery.total}.
                </p>
              </div>
              <AdminCompaniesTable
                companies={view.sortedCompanies}
                sort={view.sort}
                selectedCompanyId={view.selected?.id ?? null}
                onOpenCompany={view.openCompany}
                onSort={view.setSort}
              />

              {view.sortedCompanies.length === 0 && !companiesQuery.isInitialLoading ? (
                <div className="admin-empty-state">
                  <p>{view.hasActiveFilters ? "По текущим фильтрам компаний нет." : "Компаний пока нет."}</p>
                  {view.hasActiveFilters ? (
                    <button className="button secondary" onClick={view.resetFilters} type="button">
                      Очистить фильтры
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div ref={companiesQuery.sentinelRef} aria-hidden="true" />
              {companiesQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
              {!companiesQuery.hasMore && companiesQuery.items.length > 0 ? (
                <p className="page-subtitle">Это все компании.</p>
              ) : null}
            </div>

            <AdminCompanyDetailPanel
              selected={view.selected}
              nextStatus={view.nextStatus}
              statusReason={view.statusReason}
              statusComment={view.statusComment}
              onNextStatusChange={view.setNextStatus}
              onStatusReasonChange={view.setStatusReason}
              onStatusCommentChange={view.setStatusComment}
              onSubmitStatus={view.submitStatus}
            />
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
