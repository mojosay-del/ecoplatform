import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { PLATFORM_ROLE_SHORT_LABELS } from "../../../lib/display-labels";
import { allStaffRoles } from "./constants";
import type { StaffRoleFilter, StaffStatusFilter } from "./types";

type AdminStaffFilterBarProps = {
  search: string;
  statusFilter: StaffStatusFilter;
  roleFilter: StaffRoleFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: StaffStatusFilter) => void;
  onRoleChange: (value: StaffRoleFilter) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminStaffFilterBar({
  search,
  statusFilter,
  roleFilter,
  onSearchChange,
  onStatusChange,
  onRoleChange,
  onReset,
  onSubmit,
}: AdminStaffFilterBarProps) {
  return (
    <form className="admin-filter-bar" onSubmit={onSubmit}>
      <label className="admin-filter-field">
        <Search aria-hidden size={16} />
        <input
          aria-label="Поиск сотрудников"
          className="input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по имени, email, телефону"
          type="search"
          value={search}
        />
      </label>
      <select
        className="select"
        onChange={(event) => onStatusChange(event.target.value as StaffStatusFilter)}
        value={statusFilter}
      >
        <option value="">Все статусы</option>
        <option value="active">Активные</option>
        <option value="inactive">Деактивированные</option>
      </select>
      <select
        className="select"
        onChange={(event) => onRoleChange(event.target.value as StaffRoleFilter)}
        value={roleFilter}
      >
        <option value="">Все роли</option>
        {allStaffRoles.map((role) => (
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
