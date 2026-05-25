"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPeopleTabs } from "./AdminPeopleTabs";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

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

type AdminUserList = {
  total: number;
  page: number;
  take: number;
  items: AdminUserListItem[];
};

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

const statusLabel: Record<AdminUserListItem["status"], string> = {
  active: "Активен",
  blocked: "Заблокирован",
};

type AdminUsersViewProps = {
  embedded?: boolean;
};

export function AdminUsersView({ embedded = false }: AdminUsersViewProps) {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [list, setList] = useState<AdminUserList | null>(null);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "blocked">("");
  const [page, setPage] = useState(1);
  const take = 20;

  const [blockReason, setBlockReason] = useState<string>("policy_violation");
  const [blockComment, setBlockComment] = useState("");

  const [rolesDraft, setRolesDraft] = useState<string[]>([]);

  async function loadList(opts: { search?: string; status?: string; page?: number } = {}) {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const params = new URLSearchParams();
      params.set("take", String(take));
      params.set("page", String(opts.page ?? page));
      if (opts.search ?? search) params.set("search", opts.search ?? search);
      if (opts.status ?? statusFilter) params.set("status", opts.status ?? statusFilter);
      const data = await apiFetch<AdminUserList>(`/admin/users?${params.toString()}`, { token });
      setList(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить пользователей");
    }
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
      await loadList();
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
      await loadList();
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
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось обновить роли");
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
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

  if (state === "forbidden") {
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
      <AdminPeopleTabs />

      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          void loadList({ page: 1 });
        }}
      >
        <div className="auth-actions">
          <input
            className="input"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Поиск по email, телефону, имени"
            type="search"
            value={search}
          />
          <select
            className="select"
            onChange={(event) => setStatusFilter(event.target.value as "active" | "blocked" | "")}
            value={statusFilter}
          >
            <option value="">Все статусы</option>
            <option value="active">Активен</option>
            <option value="blocked">Заблокирован</option>
          </select>
          <button className="button" type="submit">
            Применить
          </button>
        </div>
      </form>

      {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
      {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

      {list ? (
        <div className="moderation-layout">
          <div className="stack-list">
            <p className="page-subtitle">
              Всего: {list.total}, страница {list.page}.
            </p>
            {list.items.map((item) => (
              <button
                className={`moderation-case-row ${selected?.id === item.id ? "active" : ""}`}
                key={item.id}
                onClick={() => openUser(item.id)}
                type="button"
              >
                <span className="status-pill">{statusLabel[item.status]}</span>
                <strong>
                  {item.firstName} {item.lastName}
                </strong>
                <span>{item.email}</span>
                <small>
                  {item.company?.organizationName ?? "Без компании"}
                  {item.platformStaff?.isActive && item.platformStaff.roles.length > 0
                    ? ` · ${item.platformStaff.roles.join(", ")}`
                    : ""}
                </small>
              </button>
            ))}

            <div className="auth-actions">
              <button
                className="button secondary"
                disabled={list.page <= 1}
                onClick={() => {
                  const next = list.page - 1;
                  setPage(next);
                  void loadList({ page: next });
                }}
                type="button"
              >
                ← Назад
              </button>
              <button
                className="button secondary"
                disabled={list.page * list.take >= list.total}
                onClick={() => {
                  const next = list.page + 1;
                  setPage(next);
                  void loadList({ page: next });
                }}
                type="button"
              >
                Дальше →
              </button>
            </div>
          </div>

          <div className="moderation-detail">
            {!selected ? (
              <p className="page-subtitle">Выберите пользователя.</p>
            ) : (
              <>
                <div className="list-row">
                  <div>
                    <p className="status-pill">{statusLabel[selected.status]}</p>
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
                      {selected.company.organizationName} · статус {selected.company.status}
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
