"use client";

import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { CreateStaffForm } from "./create-staff-form";
import { AdminStaffFilterBar } from "./filter-bar";
import { StaffTable } from "./staff-table";
import { useAdminStaff } from "./use-admin-staff";

export function AdminStaffView() {
  const view = useAdminStaff();
  const { staffQuery } = view;

  if (!view.token || staffQuery.state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Сотрудники</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (staffQuery.state === "forbidden") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Сотрудники</h1>
          <p className="page-subtitle">Раздел доступен только администратору.</p>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="page">
        <header className="page-header">
          <h1 className="page-title">Сотрудники</h1>
          <p className="page-subtitle">Платформенные роли: админ, модератор, контент-менеджер.</p>
        </header>

        {view.errorMessage || staffQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {view.errorMessage ?? staffQuery.errorMessage}
          </StatusPill>
        ) : null}
        {staffQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="form-actions">
          <button className="button" onClick={() => view.setCreateOpen((value) => !value)} type="button">
            {view.createOpen ? "Скрыть форму" : "Добавить сотрудника"}
          </button>
        </div>

        {view.createOpen ? (
          <CreateStaffForm form={view.createForm} onChange={view.setCreateForm} onSubmit={view.createStaff} />
        ) : null}

        <AdminStaffFilterBar
          search={view.search}
          statusFilter={view.statusFilter}
          roleFilter={view.roleFilter}
          onReset={view.resetFilters}
          onRoleChange={view.setRoleFilter}
          onSearchChange={view.setSearch}
          onStatusChange={view.setStatusFilter}
          onSubmit={view.applyFilters}
        />

        <div className="admin-table-shell">
          <div className="admin-table-meta">
            <p className="page-subtitle">
              Загружено {staffQuery.items.length} из {staffQuery.total}.
            </p>
          </div>
          <StaffTable
            staff={view.sortedItems}
            sort={view.sort}
            onSort={view.setSort}
            onUpdateStaff={view.updateStaff}
          />

          {view.sortedItems.length === 0 && !staffQuery.isInitialLoading ? (
            <div className="admin-empty-state">
              <p>{view.hasActiveFilters ? "По текущим фильтрам сотрудников нет." : "Сотрудников пока нет."}</p>
              {view.hasActiveFilters ? (
                <button className="button secondary" onClick={view.resetFilters} type="button">
                  Очистить фильтры
                </button>
              ) : null}
            </div>
          ) : null}

          <div ref={staffQuery.sentinelRef} aria-hidden="true" />
          {staffQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
          {!staffQuery.hasMore && staffQuery.items.length > 0 ? (
            <p className="page-subtitle">Это все сотрудники.</p>
          ) : null}
        </div>
      </section>
    </AppShell>
  );
}
