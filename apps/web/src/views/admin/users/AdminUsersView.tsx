"use client";

import { FormEvent, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { AdminEmptyState, AdminInfiniteFooter, AdminPageHeader } from "../../../components/admin";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { errorText, api } from "../../../lib/api";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import { useAuth } from "../../../lib/auth";
import type { AdminUserDetail, AdminUserListItem, UserSortKey } from "./types";
import { userSortSelectors, type PlatformRole } from "./constants";
import { AdminUserDetailPanel } from "./detail-panel";
import { AdminUsersFilterBar } from "./filter-bar";
import { AdminUserSessionsModal } from "./sessions-modal";
import { AdminUsersTable } from "./users-table";

type AdminUsersViewProps = {
  embedded?: boolean;
};

export function AdminUsersView({ embedded = false }: AdminUsersViewProps) {
  const { token } = useAuth();
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "blocked">("");
  const [roleFilter, setRoleFilter] = useState<"" | PlatformRole>("");
  const [filters, setFilters] = useState<{
    search: string;
    status: "" | "active" | "blocked";
    role: "" | PlatformRole;
  }>({ search: "", status: "", role: "" });
  const [sort, setSort] = useState<SortState<UserSortKey>>({ key: "createdAt", direction: "desc" });
  const take = 20;
  const usersQuery = useInfiniteApiQuery<AdminUserListItem>(
    token ? `admin-users:${filters.search}:${filters.status}` : null,
    take,
    async ({ limit, offset }) =>
      api.admin.users.list({ limit, offset }, { search: filters.search, status: filters.status }, { token }),
  );

  const [blockReason, setBlockReason] = useState<string>("policy_violation");
  const [blockComment, setBlockComment] = useState("");

  const [rolesDraft, setRolesDraft] = useState<string[]>([]);
  const filteredUsers = useMemo(() => {
    if (!filters.role) return usersQuery.items;
    return usersQuery.items.filter(
      (item) => item.platformStaff?.isActive && item.platformStaff.roles.includes(filters.role),
    );
  }, [filters.role, usersQuery.items]);
  const sortedUsers = useMemo(() => sortItems(filteredUsers, sort, userSortSelectors), [filteredUsers, sort]);
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.role);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setRoleFilter("");
    setFilters({ search: "", status: "", role: "" });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ search: search.trim(), status: statusFilter, role: roleFilter });
  }

  async function openUser(id: string) {
    if (!token) return;
    try {
      const data = await api.admin.users.get(id, { token });
      setSessionsOpen(false);
      setSelected(data);
      setRolesDraft(data.platformStaff?.roles ?? []);
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось загрузить пользователя"));
    }
  }

  async function blockUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;
    try {
      const data = await api.admin.users.block(
        selected.id,
        { reasonCode: blockReason, comment: blockComment.trim() || undefined },
        { token },
      );
      setSelected(data);
      setBlockComment("");
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось заблокировать пользователя"));
    }
  }

  async function unblockUser() {
    if (!token || !selected) return;
    try {
      const data = await api.admin.users.unblock(selected.id, { comment: blockComment.trim() || undefined }, { token });
      setSelected(data);
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось разблокировать пользователя"));
    }
  }

  async function saveRoles() {
    if (!token || !selected) return;
    try {
      const data = await api.admin.users.setPlatformRoles(
        selected.id,
        { roles: rolesDraft, isActive: rolesDraft.length > 0 },
        { token },
      );
      setSelected(data);
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось обновить роли"));
    }
  }

  if (!token || usersQuery.state === "unauthenticated") {
    const content = (
      <>
        <h1 className="page-title">Пользователи</h1>
        <p className="page-subtitle">Войдите как администратор.</p>
      </>
    );
    return embedded ? (
      <div className="settings-pane">{content}</div>
    ) : (
      <AppShell>
        <section className="page">{content}</section>
      </AppShell>
    );
  }

  if (usersQuery.state === "forbidden") {
    const content = (
      <>
        <h1 className="page-title">Пользователи</h1>
        <p className="page-subtitle">Раздел доступен только администратору.</p>
      </>
    );
    return embedded ? (
      <div className="settings-pane">{content}</div>
    ) : (
      <AppShell>
        <section className="page">{content}</section>
      </AppShell>
    );
  }

  const content = (
    <>
      <AdminPageHeader
        count={usersQuery.state === "ready" || usersQuery.items.length > 0 ? usersQuery.total : undefined}
        subtitle="Управление учётными записями платформы."
        title="Пользователи"
      />

      <AdminUsersFilterBar
        search={search}
        statusFilter={statusFilter}
        roleFilter={roleFilter}
        onRoleChange={setRoleFilter}
        onReset={resetFilters}
        onSearchChange={setSearch}
        onStatusChange={setStatusFilter}
        onSubmit={applyFilters}
      />

      {errorMessage || usersQuery.errorMessage ? (
        <StatusPill as="p" variant="danger">
          {errorMessage ?? usersQuery.errorMessage}
        </StatusPill>
      ) : null}
      {usersQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

      {usersQuery.state === "ready" || usersQuery.items.length > 0 ? (
        <div className="moderation-layout admin-master-detail">
          <div className="admin-table-shell">
            <div className="admin-table-meta">
              <p className="page-subtitle">
                Загружено {usersQuery.items.length} из {usersQuery.total}.
              </p>
            </div>
            <AdminUsersTable
              users={sortedUsers}
              sort={sort}
              selectedUserId={selected?.id ?? null}
              onOpenUser={openUser}
              onSort={setSort}
            />

            {sortedUsers.length === 0 && !usersQuery.isInitialLoading ? (
              <AdminEmptyState
                action={
                  hasActiveFilters ? (
                    <button className="button secondary" onClick={resetFilters} type="button">
                      Очистить фильтры
                    </button>
                  ) : undefined
                }
                description={
                  hasActiveFilters
                    ? "Под текущие фильтры ничего не подошло — измените условия поиска."
                    : "Здесь появятся учётные записи пользователей платформы."
                }
                icon={Users}
                title={hasActiveFilters ? "Пользователей не найдено" : "Пользователей пока нет"}
              />
            ) : null}

            <AdminInfiniteFooter
              endLabel="Это все пользователи."
              hasItems={usersQuery.items.length > 0}
              hasMore={usersQuery.hasMore}
              isLoadingMore={usersQuery.isLoadingMore}
              sentinelRef={usersQuery.sentinelRef}
            />
          </div>

          <AdminUserDetailPanel
            selected={selected}
            rolesDraft={rolesDraft}
            blockReason={blockReason}
            blockComment={blockComment}
            onBlockCommentChange={setBlockComment}
            onBlockReasonChange={setBlockReason}
            onBlockUser={blockUser}
            onOpenSessions={() => setSessionsOpen(true)}
            onRolesDraftChange={setRolesDraft}
            onSaveRoles={saveRoles}
            onUnblockUser={unblockUser}
          />
        </div>
      ) : null}

      {selected && sessionsOpen ? (
        <AdminUserSessionsModal
          user={selected}
          sessions={selected.recentSessions}
          onClose={() => setSessionsOpen(false)}
        />
      ) : null}
    </>
  );

  return embedded ? (
    <div className="settings-pane settings-pane-wide">{content}</div>
  ) : (
    <AppShell>
      <section className="page">{content}</section>
    </AppShell>
  );
}
