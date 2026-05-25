"use client";

import Image from "next/image";
import { FormEvent, useEffect, useState } from "react";
import { AdminPeopleTabs } from "./AdminPeopleTabs";
import { AppShell } from "./AppShell";
import { ApiError, apiFetch } from "../lib/api";
import { useAuth } from "../lib/auth";

type ApiState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";

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
    gender: "male" | "female";
    status: string;
    createdAt: string;
  };
};

const allRoles = ["admin", "moderator", "content_manager"] as const;

const genderOptions = [
  { value: "male", label: "Мужской" },
  { value: "female", label: "Женский" },
] as const;

export function AdminStaffView() {
  const { token } = useAuth();
  const [state, setState] = useState<ApiState>("unauthenticated");
  const [items, setItems] = useState<StaffItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    phone: "",
    firstName: "",
    lastName: "",
    gender: "male",
    password: "",
    roles: ["moderator"] as string[],
  });

  async function loadList() {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setErrorMessage(null);
    try {
      const data = await apiFetch<StaffItem[]>("/admin/staff", { token });
      setItems(data);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setState("forbidden");
        return;
      }
      setState("error");
      setErrorMessage(error instanceof Error ? error.message : "Не удалось загрузить сотрудников");
    }
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    try {
      await apiFetch("/admin/staff", { method: "POST", token, body: createForm });
      setCreateOpen(false);
      setCreateForm({
        email: "",
        phone: "",
        firstName: "",
        lastName: "",
        gender: "male",
        password: "",
        roles: ["moderator"],
      });
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось создать сотрудника");
    }
  }

  async function updateStaff(userId: string, patch: { roles?: string[]; isActive?: boolean }) {
    if (!token) return;
    try {
      await apiFetch(`/admin/staff/${userId}`, { method: "PATCH", token, body: patch });
      await loadList();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Не удалось обновить сотрудника");
    }
  }

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === "unauthenticated") {
    return (
      <AppShell>
        <section className="page">
          <h1 className="page-title">Сотрудники</h1>
          <p className="page-subtitle">Войдите как администратор.</p>
        </section>
      </AppShell>
    );
  }

  if (state === "forbidden") {
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
        <AdminPeopleTabs />

        {errorMessage ? <p className="status-pill">{errorMessage}</p> : null}
        {state === "loading" ? <p className="page-subtitle">Загрузка…</p> : null}

        <div className="auth-actions">
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
                required
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
              className="input"
              minLength={10}
              onChange={(event) => setCreateForm((form) => ({ ...form, password: event.target.value }))}
              placeholder="Временный пароль (>= 10 символов)"
              required
              value={createForm.password}
            />
            <div className="auth-actions">
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
                  {role}
                </label>
              ))}
            </div>
            <button className="button" type="submit">
              Создать сотрудника
            </button>
          </form>
        ) : null}

        <div className="stack-list">
          {items.map((staff) => (
            <article className="checklist-block" key={staff.id}>
              <div className="staff-profile">
                <Image
                  className="staff-avatar"
                  alt=""
                  src={resolvePlatformAvatarUrl(staff.roles, staff.user.gender)}
                  width={58}
                  height={58}
                />
                <div>
                  <strong>
                    {staff.user.firstName} {staff.user.lastName}
                  </strong>
                  <p>
                    {staff.user.email} · {staff.user.phone}
                  </p>
                  <p className="page-subtitle">Пол: {staff.user.gender === "female" ? "Женский" : "Мужской"}</p>
                </div>
              </div>
              <p>
                <span className="status-pill">{staff.isActive ? "Активен" : "Деактивирован"}</span> Роли:{" "}
                {staff.roles.join(", ") || "—"}
              </p>
              <div className="auth-actions">
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
                      {has ? `Снять ${role}` : `Дать ${role}`}
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
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}

function resolvePlatformAvatarUrl(roles: string[], gender: string): string {
  const suffix = gender === "female" ? "woman" : "man";
  const prefix = roles.includes("admin") ? "a" : "m";

  return `/avatars/platform/${prefix}${suffix}.png`;
}
