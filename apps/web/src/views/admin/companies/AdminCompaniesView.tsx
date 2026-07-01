"use client";

import { Building2 } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { AdminEmptyState, AdminInfiniteFooter, AdminPageHeader } from "../../../components/admin";
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
        <AdminPageHeader
          count={companiesQuery.state === "ready" || companiesQuery.items.length > 0 ? companiesQuery.total : undefined}
          subtitle="Управление компаниями и их подписками."
          title="Компании"
        />

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
                <AdminEmptyState
                  action={
                    view.hasActiveFilters ? (
                      <button className="button secondary" onClick={view.resetFilters} type="button">
                        Очистить фильтры
                      </button>
                    ) : undefined
                  }
                  description={
                    view.hasActiveFilters
                      ? "Под текущие фильтры ничего не подошло — измените условия поиска."
                      : "Здесь появятся компании после регистрации на платформе."
                  }
                  icon={Building2}
                  title={view.hasActiveFilters ? "Компаний не найдено" : "Компаний пока нет"}
                />
              ) : null}

              <AdminInfiniteFooter
                endLabel="Это все компании."
                hasItems={companiesQuery.items.length > 0}
                hasMore={companiesQuery.hasMore}
                isLoadingMore={companiesQuery.isLoadingMore}
                sentinelRef={companiesQuery.sentinelRef}
              />
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
              onSubscriptionActivated={() => {
                if (view.selected) void view.openCompany(view.selected.id);
                companiesQuery.reload();
              }}
            />
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}
