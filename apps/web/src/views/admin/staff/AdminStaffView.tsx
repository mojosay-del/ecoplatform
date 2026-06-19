"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { RotateCcw, Search, UserRound } from "lucide-react";
import { MIN_PASSWORD_LENGTH, platformRoles } from "@ecoplatform/shared";
import { AdminSortButton } from "../../../components/AdminSortButton";
import { AppShell } from "../../../components/AppShell";
import { StatusPill } from "../../../components/StatusPill";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import {
  PLATFORM_ROLE_SHORT_LABELS,
  STAFF_STATUS_LABELS,
  USER_GENDER_LABELS,
  formatPlatformRoles,
} from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";

type StaffItem = {
  id: string;
  userId: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    gender: "male" | "female" | null;
    status: string;
    createdAt: string;
  };
};

const allRoles = platformRoles;
type PlatformRole = (typeof allRoles)[number];
type StaffSortKey = "name" | "status" | "role" | "email" | "createdAt";

const genderOptions = [
  { value: "", label: "Не указано" },
  { value: "male", label: USER_GENDER_LABELS.male },
  { value: "female", label: USER_GENDER_LABELS.female },
] as const;

const staffSortSelectors: Record<StaffSortKey, (item: StaffItem) => string | number> = {
  name: (item) => `${item.user.lastName} ${item.user.firstName}`,
  status: (item) => (item.isActive ? STAFF_STATUS_LABELS.active : STAFF_STATUS_LABELS.inactive),
  role: (item) => formatPlatformRoles(item.roles),
  email: (item) => item.user.email,
  createdAt: (item) => Date.parse(item.createdAt),
};

export function AdminStaffView() {
  const { token } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const staffQuery = useInfiniteApiQuery<StaffItem>(token ? "admin-staff" : null, 30, async ({ limit, offset }) => {
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return apiFetch<{ items: StaffItem[]; total: number; hasMore: boolean }>(`/admin/staff?${query}`, { token });
  });
  const items = staffQuery.items;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "inactive">("");
  const [roleFilter, setRoleFilter] = useState<"" | PlatformRole>("");
  const [filters, setFilters] = useState<{
    search: string;
    status: "" | "active" | "inactive";
    role: "" | PlatformRole;
  }>({ search: "", status: "", role: "" });
  const [sort, setSort] = useState<SortState<StaffSortKey>>({ key: "createdAt", direction: "desc" });
  const filteredItems = useMemo(() => {
    const query = filters.search.toLowerCase();

    return items.filter((staff) => {
      if (filters.status === "active" && !staff.isActive) return false;
      if (filters.status === "inactive" && staff.isActive) return false;
      if (filters.role && !staff.roles.includes(filters.role)) return false;

      if (query) {
        const haystack = [
          staff.user.firstName,
          staff.user.lastName,
          staff.user.email,
          staff.user.phone,
          formatPlatformRoles(staff.roles),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });
  }, [filters, items]);
  const sortedItems = useMemo(() => sortItems(filteredItems, sort, staffSortSelectors), [filteredItems, sort]);
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.role);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    phone: "",
    firstName: "",
    lastName: "",
    gender: "",
    password: "",
    roles: ["moderator"] as string[],
  });

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/admin/staff", {
        method: "POST",
        token,
        body: { ...createForm, gender: createForm.gender || null },
      });
      setCreateOpen(false);
      setCreateForm({
        email: "",
        phone: "",
        firstName: "",
        lastName: "",
        gender: "",
        password: "",
        roles: ["moderator"],
      });
      staffQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось создать сотрудника");
    }
  }

  async function updateStaff(userId: string, patch: { roles?: string[]; isActive?: boolean }) {
    if (!token) return;
    try {
      await apiFetch(`/admin/staff/${userId}`, { method: "PATCH", token, body: patch });
      staffQuery.reload();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось обновить сотрудника");
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setRoleFilter("");
    setFilters({ search: "", status: "", role: "" });
  }

  if (!token || staffQuery.state === "unauthenticated") {
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

        {errorMessage || staffQuery.errorMessage ? (
          <StatusPill as="p" variant="danger">
            {errorMessage ?? staffQuery.errorMessage}
          </StatusPill>
        ) : null}
        {staffQuery.isInitialLoading ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="form-actions">
          <button className="button" onClick={() => setCreateOpen((value) => !value)} type="button">
            {createOpen ? "Скрыть форму" : "Добавить сотрудника"}
          </button>
        </div>

        {createOpen ? (
          <form className="form" onSubmit={createStaff}>
            <input
              className="input"
              onChange={(event) => setCreateForm((form) => ({ ...form, email: event.target.value }))}
              placeholder="email"
              required
              type="email"
              value={createForm.email}
            />
            <input
              className="input"
              onChange={(event) => setCreateForm((form) => ({ ...form, phone: event.target.value }))}
              placeholder="+79991234567"
              required
              value={createForm.phone}
            />
            <input
              className="input"
              onChange={(event) => setCreateForm((form) => ({ ...form, firstName: event.target.value }))}
              placeholder="Имя"
              required
              value={createForm.firstName}
            />
            <input
              className="input"
              onChange={(event) => setCreateForm((form) => ({ ...form, lastName: event.target.value }))}
              placeholder="Фамилия"
              required
              value={createForm.lastName}
            />
            <label className="field-label">
              Пол
              <select
                className="select"
                onChange={(event) => setCreateForm((form) => ({ ...form, gender: event.target.value }))}
                value={createForm.gender}
              >
                {genderOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Временный пароль"
              autoComplete="new-password"
              className="input"
              minLength={MIN_PASSWORD_LENGTH}
              onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))}
              placeholder={`Временный пароль (>= ${MIN_PASSWORD_LENGTH} символов)`}
              required
              type="password"
              value={createForm.password}
            />
            <div className="form-actions">
              {allRoles.map((role) => (
                <label className="checklist-item" key={role}>
                  <input
                    checked={createForm.roles.includes(role)}
                    onChange={(event) =>
                      setCreateForm((form) => ({
                        ...form,
                        roles: event.target.checked
                          ? [...form.roles, role]
                          : form.roles.filter((item) => item !== role),
                      }))
                    }
                    type="checkbox"
                  />
                  {PLATFORM_ROLE_SHORT_LABELS[role]}
                </label>
              ))}
            </div>
            <button className="button" type="submit">
              Создать сотрудника
            </button>
          </form>
        ) : null}

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
              aria-label="Поиск сотрудников"
              className="input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по имени, email, телефону"
              type="search"
              value={search}
            />
          </label>
          <select
            className="select"
            onChange={(event) => setStatusFilter(event.target.value as "" | "active" | "inactive")}
            value={statusFilter}
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Деактивированные</option>
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

        <div className="admin-table-shell">
          <div className="admin-table-meta">
            <p className="page-subtitle">
              Загружено {items.length} из {staffQuery.total}.
            </p>
          </div>
          <div className="admin-table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">
                    <AdminSortButton label="Сотрудник" sort={sort} sortKey="name" onSort={setSort} />
                  </th>
                  <th scope="col">
                    <AdminSortButton label="Статус" sort={sort} sortKey="status" onSort={setSort} />
                  </th>
                  <th scope="col">
                    <AdminSortButton label="Роли" sort={sort} sortKey="role" onSort={setSort} />
                  </th>
                  <th scope="col">
                    <AdminSortButton label="Email" sort={sort} sortKey="email" onSort={setSort} />
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
                  <th scope="col">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((staff) => (
                  <tr key={staff.id}>
                    <td>
                      <div className="staff-profile">
                        {staff.user.gender ? (
                          <Image
                            className="staff-avatar"
                            alt=""
                            src={resolvePlatformAvatarUrl(staff.roles, staff.user.gender)}
                            width={36}
                            height={36}
                          />
                        ) : (
                          <span className="staff-avatar staff-avatar-placeholder" aria-hidden="true">
                            <UserRound size={18} />
                          </span>
                        )}
                        <div className="admin-table-cell-main">
                          <strong>
                            {staff.user.firstName} {staff.user.lastName}
                          </strong>
                          <span className="admin-table-muted">{staff.user.phone}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StatusPill variant={staff.isActive ? "success" : "danger"}>
                        {staff.isActive ? STAFF_STATUS_LABELS.active : STAFF_STATUS_LABELS.inactive}
                      </StatusPill>
                    </td>
                    <td>{formatPlatformRoles(staff.roles)}</td>
                    <td>{staff.user.email}</td>
                    <td>{new Date(staff.createdAt).toLocaleDateString("ru-RU")}</td>
                    <td>
                      <div className="admin-table-actions">
                        {allRoles.map((role) => {
                          const has = staff.roles.includes(role);
                          return (
                            <button
                              className={`button ${has ? "secondary" : ""}`}
                              key={role}
                              onClick={() =>
                                updateStaff(staff.userId, {
                                  roles: has ? staff.roles.filter((item) => item !== role) : [...staff.roles, role],
                                })
                              }
                              type="button"
                            >
                              {has
                                ? `Снять ${PLATFORM_ROLE_SHORT_LABELS[role]}`
                                : `Дать ${PLATFORM_ROLE_SHORT_LABELS[role]}`}
                            </button>
                          );
                        })}
                        <button
                          className="button secondary"
                          onClick={() => updateStaff(staff.userId, { isActive: !staff.isActive })}
                          type="button"
                        >
                          {staff.isActive ? "Деактивировать" : "Активировать"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sortedItems.length === 0 && !staffQuery.isInitialLoading ? (
            <div className="admin-empty-state">
              <p>{hasActiveFilters ? "По текущим фильтрам сотрудников нет." : "Сотрудников пока нет."}</p>
              {hasActiveFilters ? (
                <button className="button secondary" onClick={resetFilters} type="button">
                  Очистить фильтры
                </button>
              ) : null}
            </div>
          ) : null}

          <div ref={staffQuery.sentinelRef} aria-hidden="true" />
          {staffQuery.isLoadingMore ? <p className="page-subtitle">Загружаем ещё…</p> : null}
          {!staffQuery.hasMore && items.length > 0 ? <p className="page-subtitle">Это все сотрудники.</p> : null}
        </div>
      </section>
    </AppShell>
  );
}

function resolvePlatformAvatarUrl(roles: string[], gender: "male" | "female"): string {
  const suffix = gender === "female" ? "woman" : "man";
  const prefix = roles.includes("admin") ? "a" : "m";

  return `/avatars/platform/${prefix}${suffix}.png`;
}
