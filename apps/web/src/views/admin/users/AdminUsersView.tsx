"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  Check,
  FileText,
  Gavel,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { AdminSortButton } from "../../../components/AdminSortButton";
import { AppShell } from "../../../components/AppShell";
import { StatusPill, companyStatusPillVariant, userStatusPillVariant } from "../../../components/StatusPill";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { apiFetch } from "../../../lib/api";
import {
  COMPANY_STATUS_LABELS,
  MODERATION_REASON_LABELS,
  PLATFORM_ROLE_SHORT_LABELS,
  USER_STATUS_LABELS,
  formatPlatformRoles,
} from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import { useAuth } from "../../../lib/auth";
import type { AdminUserDetail, AdminUserList, AdminUserListItem, UserSortKey } from "./types";
import { allRoles, blockReasonCodes, userSortSelectors, type PlatformRole } from "./constants";
import { formatLatestSession, formatSessionsCount } from "./format";
import { AdminUserSessionsModal } from "./sessions-modal";

type AdminUsersViewProps = {
  embedded?: boolean;
};

const ROLE_ICONS: Record<string, LucideIcon> = {
  admin: ShieldCheck,
  moderator: Gavel,
  content_manager: FileText,
};

const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Полный доступ к панели",
  moderator: "Жалобы и санкции",
  content_manager: "Контент и публикации",
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
      setSessionsOpen(false);
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
              {PLATFORM_ROLE_SHORT_LABELS[role]}
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
                        <StatusPill variant={userStatusPillVariant(item.status)}>
                          {USER_STATUS_LABELS[item.status]}
                        </StatusPill>
                      </td>
                      <td>{item.company?.organizationName ?? "Без компании"}</td>
                      <td>{formatPlatformRoles(item.platformStaff?.isActive ? item.platformStaff.roles : [])}</td>
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

          <div className="moderation-detail admin-user-detail">
            {!selected ? (
              <p className="page-subtitle auser-empty">Выберите пользователя.</p>
            ) : (
              <>
                <header className="auser-head">
                  <div className="auser-avatar" aria-hidden="true">
                    {(selected.firstName?.[0] ?? "") + (selected.lastName?.[0] ?? "") || "?"}
                  </div>
                  <div className="auser-id">
                    <StatusPill variant={userStatusPillVariant(selected.status)}>
                      {USER_STATUS_LABELS[selected.status]}
                    </StatusPill>
                    <h2 className="auser-name">
                      {selected.firstName} {selected.lastName}
                    </h2>
                    <p className="auser-contacts">
                      {selected.email} · {selected.phone}
                    </p>
                  </div>
                  {selected.status === "blocked" ? (
                    <button className="button secondary auser-unblock" onClick={unblockUser} type="button">
                      Разблокировать
                    </button>
                  ) : null}
                </header>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <Building2 aria-hidden size={15} />
                    <span>Компания</span>
                  </div>
                  {selected.company ? (
                    <p className="auser-company">
                      {selected.company.organizationName}{" "}
                      <StatusPill variant={companyStatusPillVariant(selected.company.status)}>
                        {COMPANY_STATUS_LABELS[selected.company.status] ?? selected.company.status}
                      </StatusPill>
                    </p>
                  ) : (
                    <p className="auser-muted">Не привязан к компании.</p>
                  )}
                </section>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <ShieldCheck aria-hidden size={15} />
                    <span>Платформенные роли</span>
                  </div>
                  <div className="auser-roles">
                    {allRoles.map((role) => {
                      const RoleIcon = ROLE_ICONS[role] ?? ShieldCheck;
                      const checked = rolesDraft.includes(role);
                      return (
                        <label className={`auser-role${checked ? " is-on" : ""}`} key={role}>
                          <input
                            className="auser-role-input"
                            checked={checked}
                            onChange={(event) => {
                              setRolesDraft((prev) =>
                                event.target.checked ? [...prev, role] : prev.filter((item) => item !== role),
                              );
                            }}
                            type="checkbox"
                          />
                          <span className="auser-role-icon">
                            <RoleIcon aria-hidden size={18} />
                          </span>
                          <span className="auser-role-text">
                            <strong>{PLATFORM_ROLE_SHORT_LABELS[role]}</strong>
                            <small>{ROLE_DESCRIPTIONS[role]}</small>
                          </span>
                          <span className="auser-role-check" aria-hidden="true">
                            <Check size={14} strokeWidth={3} />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <button className="button auser-save" onClick={saveRoles} type="button">
                    Сохранить роли
                  </button>
                </section>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <Ban aria-hidden size={15} />
                    <span>Активные ограничения по модулям</span>
                  </div>
                  {selected.activeRestrictions.length === 0 ? (
                    <p className="auser-muted">Нет.</p>
                  ) : (
                    <div className="stack-list">
                      {selected.activeRestrictions.map((restriction) => (
                        <article className="auser-restriction" key={restriction.id}>
                          <strong>{restriction.moduleCode}</strong>
                          <p>
                            До {new Date(restriction.expiresAt).toLocaleString("ru-RU")} ·{" "}
                            {MODERATION_REASON_LABELS[restriction.reasonCode] ?? restriction.reasonCode}
                          </p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="auser-section">
                  <div className="auser-section-head">
                    <Smartphone aria-hidden size={15} />
                    <span>Последние сессии</span>
                  </div>
                  {selected.recentSessions.length === 0 ? (
                    <p className="auser-muted">Нет данных о входах.</p>
                  ) : (
                    <button className="admin-sessions-trigger" onClick={() => setSessionsOpen(true)} type="button">
                      <Smartphone aria-hidden size={18} />
                      <span>
                        <strong>{formatSessionsCount(selected.recentSessions.length)}</strong>
                        <small>{formatLatestSession(selected.recentSessions[0]!)}</small>
                      </span>
                    </button>
                  )}
                </section>

                {selected.status === "active" ? (
                  <form className="form auser-danger" onSubmit={blockUser}>
                    <div className="auser-section-head auser-danger-head">
                      <ShieldAlert aria-hidden size={15} />
                      <span>Заблокировать</span>
                    </div>
                    <select
                      className="select"
                      onChange={(event) => setBlockReason(event.target.value)}
                      value={blockReason}
                    >
                      {blockReasonCodes.map((value) => (
                        <option key={value} value={value}>
                          {MODERATION_REASON_LABELS[value] ?? value}
                        </option>
                      ))}
                    </select>
                    <textarea
                      className="textarea small"
                      onChange={(event) => setBlockComment(event.target.value)}
                      placeholder="Комментарий (обязателен для «Иное»)"
                      value={blockComment}
                    />
                    <button className="button danger" type="submit">
                      Заблокировать пользователя
                    </button>
                  </form>
                ) : null}
              </>
            )}
          </div>
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
