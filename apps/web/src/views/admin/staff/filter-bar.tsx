import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { PopoverSelect, type PopoverSelectOption } from "../../../components/ui/PopoverSelect";
import { PLATFORM_ROLE_SHORT_LABELS } from "../../../lib/display-labels";
import { allStaffRoles } from "./constants";
import type { StaffRoleFilter, StaffStatusFilter } from "./types";

const STATUS_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активные" },
  { value: "inactive", label: "Деактивированные" },
];

const ROLE_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все роли" },
  ...allStaffRoles.map((role) => ({ value: role, label: PLATFORM_ROLE_SHORT_LABELS[role] ?? role })),
];

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
      <PopoverSelect
        label="Статус"
        value={statusFilter}
        options={STATUS_OPTIONS}
        onChange={(value) => onStatusChange(value as StaffStatusFilter)}
      />
      <PopoverSelect
        label="Роль"
        value={roleFilter}
        options={ROLE_OPTIONS}
        onChange={(value) => onRoleChange(value as StaffRoleFilter)}
      />
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
