import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { PLATFORM_ROLE_SHORT_LABELS } from "../../../lib/display-labels";
import { allRoles, type PlatformRole } from "./constants";

type AdminUsersFilterBarProps = {
  search: string;
  statusFilter: "" | "active" | "blocked";
  roleFilter: "" | PlatformRole;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: "" | "active" | "blocked") => void;
  onRoleChange: (value: "" | PlatformRole) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminUsersFilterBar({
  search,
  statusFilter,
  roleFilter,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onReset,
  onSubmit,
}: AdminUsersFilterBarProps) {
  return (
    <form className="admin-filter-bar" onSubmit={onSubmit}>
      <label className="admin-filter-field">
        <Search aria-hidden size={16} />
        <input
          aria-label="Поиск пользователей"
          className="input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по email, телефону, имени"
          type="search"
          value={search}
        />
      </label>
      <select
        className="select"
        onChange={(event) => onStatusChange(event.target.value as "" | "active" | "blocked")}
        value={statusFilter}
      >
        <option value="">Все статусы</option>
        <option value="active">Активен</option>
        <option value="blocked">Заблокирован</option>
      </select>
      <select
        className="select"
        onChange={(event) => onRoleChange(event.target.value as "" | PlatformRole)}
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
        <button className="button secondary" onClick={onReset} type="button">
          <RotateCcw aria-hidden size={16} />
          Сбросить
        </button>
      </div>
    </form>
  );
}
