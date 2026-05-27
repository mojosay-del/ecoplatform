"use client";

import { FormEvent, useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import type { PaginatedResponse } from "@ecoplatform/shared";
import { AdminSortButton } from "./AdminSortButton";
import { AppShell } from "./AppShell";
import { CmsTabs } from "./CmsTabs";
import { StatusPill, companyStatusPillVariant, userStatusPillVariant } from "./StatusPill";
import { sortItems, type SortState } from "./admin-table-utils";
import { apiFetch } from "../lib/api";
import { useInfiniteApiQuery } from "../lib/use-infinite-api-query";
import { useAuth } from "../lib/auth";

type AdminUserListItem = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: "active" | "blocked";
  createdAt: string;
  company: { id: string; organizationName: string; status: string } | null;
  platformStaff: { roles: string[]; isActive: boolean } | null;
};

type AdminUserList = PaginatedResponse<AdminUserListItem>;
type UserSortKey = "name" | "status" | "company" | "role" | "phone" | "createdAt";

type AdminUserDetail = AdminUserListItem & {
  updatedAt: string;
  activeRestrictions: Array<{
    id: string;
    moduleCode: string;
    expiresAt: string;
    reasonCode: string;
    comment: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
};

const blockReasonLabels: ReadonlyArray<readonly [string, string]> = [
  ["policy_violation", "Нарушение правил"],
  ["fraud", "Мошенничество"],
  ["suspicious_activity", "Подозрительная активность"],
  ["support_request", "По запросу поддержки"],
  ["other", "Иное"],
];

const allRoles = ["admin", "moderator", "content_manager"] as const;
type PlatformRole = (typeof allRoles)[number];

const statusLabel: Record<AdminUserListItem["status"], string> = {
  active: "Активен",
  blocked: "Заблокирован",
};

const companyStatusLabel: Record<string, string> = {
  demo: "Демо",
  active: "Активна",
  past_due: "Просрочена",
  suspended: "Приостановлена",
  pending_deletion: "Удаление запланировано",
  blocked: "Заблокирована",
  archived: "В архиве",
};

const roleLabel: Record<string, string> = {
  admin: "Админ",
  moderator: "Модератор",
  content_manager: "Контент-менеджер",
};

const userSortSelectors: Record<UserSortKey, (item: AdminUserListItem) => string | number> = {
  name: (item) => `${item.lastName} ${item.firstName}`,
  status: (item) => statusLabel[item.status],
  company: (item) => item.company?.organizationName ?? "",
  role: (item) => formatRoles(item.platformStaff?.roles ?? []),
  phone: (item) => item.phone,
  createdAt: (item) => Date.parse(item.createdAt),
};

type AdminUsersViewProps = {
  embedded?: boolean;
};

export function AdminUsersView({ embedded = false }: AdminUsersViewProps) {
  const { token } = useAuth();
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
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
    async ({ limit, offset }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (filters.search) params.set("search", filters.search);
      if (filters.status) params.set("status", filters.status);
      return apiFetch<AdminUserList>(`/admin/users?${params.toString()}`, { token });
    },
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

  async function openUser(id: string) {
    if (!token) return;
    try {
      const data = await apiFetch<AdminUserDetail>(`/admin/users/${id}`, { token });
      setSelected(data);
      setRolesDraft(data.platformStaff?.roles ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить пользователя");
    }
  }

  async function blockUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selected) return;
    try {
      const data = await apiFetch<AdminUserDetail>(`/admin/users/${selected.id}/block`, {
        method: "POST",
        token,
        body: { reasonCode: blockReason, comment: blockComment.trim() || undefined },
      });
      setSelected(data);
      setBlockComment("");
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось заблокировать пользователя");
    }
  }

  async function unblockUser() {
    if (!token || !selected) return;
    try {
      const data = await apiFetch<AdminUserDetail>(`/admin/users/${selected.id}/unblock`, {
        method: "POST",
        token,
        body: { comment: blockComment.trim() || undefined },
      });
      setSelected(data);
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось разблокировать пользователя");
    }
  }

  async function saveRoles() {
    if (!token || !selected) return;
    try {
      const data = await apiFetch<AdminUserDetail>(`/admin/users/${selected.id}/platform-roles`, {
        method: "PATCH",
        token,
        body: { roles: rolesDraft, isActive: rolesDraft.length > 0 },
      });
      setSelected(data);
      usersQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось обновить роли");
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
      <header className="page-header">
        <h1 className="page-title">Пользователи</h1>
        <p className="page-subtitle">Управление учётными записями платформы.</p>
      </header>
      <CmsTabs />

      <form
        className="admin-filter-bar"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ search: search.trim(), status: statusFilter, role: roleFilter });
        }}
      >
        <label className="admin-filter-field">
          <Search aria-hidden size={16} />
          <input
            aria-label="Поиск пользователей"
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по email, телефону, имени"
            type="search"
            value={search}
          />
        </label>
        <select
          className="select"
          onChange={(event) => setStatusFilter(event.target.value as "active" | "blocked" | "")}
          value={statusFilter}
        >
          <option value="">Все статусы</option>
          <option value="active">Активен</option>
          <option value="blocked">Заблокирован</option>
        </select>
        <select
          className="select"
          onChange={(event) => setRoleFilter(event.target.value as "" | PlatformRole)}
          value={roleFilter}
        >
          <option value="">Все роли</option>
          {allRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabel[role]}
            </option>
          ))}
        </select>
        <div className="admin-filter-actions">
          <button className="button" type="submit">
            Применить
          </button>
          <button className="button secondary" onClick={resetFilters} type="button">
            <RotateCcw aria-hidden size={16} />
            Сбросить
          </button>
        </div>
      </form>

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
            <div className="admin-table-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <AdminSortButton label="Пользователь" sort={sort} sortKey="name" onSort={setSort} />
                    </th>
                    <th scope="col">
                      <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={setSort} />
                    </th>
                    <th scope="col">
                      <AdminSortButton label="Компания" sort={sort} sortKey="company" onSort={setSort} />
                    </th>
                    <th scope="col">
                      <AdminSortButton label="Роли" sort={sort} sortKey="role" onSort={setSort} />
                    </th>
                    <th scope="col">
                      <AdminSortButton label="Телефон" sort={sort} sortKey="phone" onSort={setSort} />
                    </th>
                    <th scope="col">
                      <AdminSortButton
                        defaultDirection="desc"
                        label="Создан"
                        sort={sort}
                        sortKey="createdAt"
                        onSort={setSort}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.map((item) => (
                    <tr className={selected?.id === item.id ? "active" : ""} key={item.id}>
                      <td>
                        <div className="admin-table-cell-main">
                          <button className="admin-row-button" onClick={() => openUser(item.id)} type="button">
                            {item.firstName} {item.lastName}
                          </button>
                          <span className="admin-table-muted">{item.email}</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill variant={userStatusPillVariant(item.status)}>{statusLabel[item.status]}</StatusPill>
                      </td>
                      <td>{item.company?.organizationName ?? "Без компании"}</td>
                      <td>{formatRoles(item.platformStaff?.isActive ? item.platformStaff.roles : [])}</td>
                      <td>{item.phone}</td>
                      <td>{new Date(item.createdAt).toLocaleDateString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sortedUsers.length === 0 && !usersQuery.isInitialLoading ? (
              <div className="admin-empty-state">
                <p>{hasActiveFilters ? "По текущим фильтрам пользователей нет." : "Пользователей пока нет."}</p>
                {hasActiveFilters ? (
                  <button className="button secondary" onClick={resetFilters} type="button">
                    Очистить фильтры
                  </button>
                ) : null}
              </div>
            ) : null}

            <div ref={usersQuery.sentinelRef} aria-hidden="true" />
            {usersQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
            {!usersQuery.hasMore && usersQuery.items.length > 0 ? (
              <p className="page-subtitle">Это все пользователи.</p>
            ) : null}
          </div>

          <div className="moderation-detail">
            {!selected ? (
              <p className="page-subtitle">Выберите пользователя.</p>
            ) : (
              <>
                <div className="list-row">
                  <div>
                    <StatusPill as="p" variant={userStatusPillVariant(selected.status)}>
                      {statusLabel[selected.status]}
                    </StatusPill>
                    <h2>
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <p className="page-subtitle">
                      {selected.email} · {selected.phone}
                    </p>
                  </div>
                  <div className="auth-actions">
                    {selected.status === "blocked" ? (
                      <button className="button secondary" onClick={unblockUser} type="button">
                        Разблокировать
                      </button>
                    ) : null}
                  </div>
                </div>

                <section>
                  <h3>Компания</h3>
                  {selected.company ? (
                    <p>
                      {selected.company.organizationName} ·{" "}
                      <StatusPill variant={companyStatusPillVariant(selected.company.status)}>
                        {companyStatusLabel[selected.company.status] ?? selected.company.status}
                      </StatusPill>
                    </p>
                  ) : (
                    <p className="page-subtitle">Не привязан к компании.</p>
                  )}
                </section>

                <section>
                  <h3>Платформенные роли</h3>
                  <div className="auth-actions">
                    {allRoles.map((role) => (
                      <label className="checklist-item" key={role}>
                        <input
                          checked={rolesDraft.includes(role)}
                          onChange={(event) => {
                            setRolesDraft((prev) =>
                              event.target.checked ? [...prev, role] : prev.filter((item) => item !== role),
                            );
                          }}
                          type="checkbox"
                        />
                        {role}
                      </label>
                    ))}
                  </div>
                  <button className="button" onClick={saveRoles} type="button">
                    Сохранить роли
                  </button>
                </section>

                <section>
                  <h3>Активные ограничения по модулям</h3>
                  {selected.activeRestrictions.length === 0 ? (
                    <p className="page-subtitle">Нет.</p>
                  ) : (
                    <div className="stack-list">
                      {selected.activeRestrictions.map((restriction) => (
                        <article className="checklist-block" key={restriction.id}>
                          <strong>{restriction.moduleCode}</strong>
                          <p>
                            До {new Date(restriction.expiresAt).toLocaleString("ru-RU")} · {restriction.reasonCode}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section>
                  <h3>Последние сессии</h3>
                  <div className="stack-list">
                    {selected.recentSessions.map((session) => (
                      <article className="checklist-block" key={session.id}>
                        <strong>{session.userAgent ?? "Без UA"}</strong>
                        <p>
                          {session.ipAddress ?? "—"} · {new Date(session.createdAt).toLocaleString("ru-RU")}
                        </p>
                        <small>
                          {session.revokedAt
                            ? `Отозвана ${new Date(session.revokedAt).toLocaleString("ru-RU")}`
                            : `Активна до ${new Date(session.expiresAt).toLocaleString("ru-RU")}`}
                        </small>
                      </article>
                    ))}
                  </div>
                </section>

                {selected.status === "active" ? (
                  <form className="form" onSubmit={blockUser}>
                    <h3>Заблокировать</h3>
                    <select
                      className="select"
                      onChange={(event) => setBlockReason(event.target.value)}
                      value={blockReason}
                    >
                      {blockReasonLabels.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="textarea small"
                      onChange={(event) => setBlockComment(event.target.value)}
                      placeholder="Комментарий (обязателен для «Иное»)"
                      value={blockComment}
                    />
                    <button className="button" type="submit">
                      Заблокировать пользователя
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </div>
        </div>
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

function formatRoles(roles: readonly string[]) {
  if (roles.length === 0) return "—";
  return roles.map((role) => roleLabel[role] ?? role).join(", ");
}
