import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { PopoverSelect, type PopoverSelectOption } from "../../../components/ui/PopoverSelect";
import { PLATFORM_ROLE_SHORT_LABELS } from "../../../lib/display-labels";
import { allRoles, type PlatformRole } from "./constants";

const STATUS_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все статусы" },
  { value: "active", label: "Активен" },
  { value: "blocked", label: "Заблокирован" },
];

const ROLE_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все роли" },
  ...allRoles.map((role) => ({ value: role, label: PLATFORM_ROLE_SHORT_LABELS[role] ?? role })),
];

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
      <PopoverSelect
        label="Статус"
        value={statusFilter}
        options={STATUS_OPTIONS}
        onChange={(value) => onStatusChange(value as "" | "active" | "blocked")}
      />
      <PopoverSelect
        label="Роль"
        value={roleFilter}
        options={ROLE_OPTIONS}
        onChange={(value) => onRoleChange(value as "" | PlatformRole)}
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
