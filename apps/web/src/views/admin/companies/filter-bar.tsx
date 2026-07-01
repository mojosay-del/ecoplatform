import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { PopoverSelect, type PopoverSelectOption } from "../../../components/ui/PopoverSelect";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS } from "../../../lib/display-labels";
import { COMPANY_STATUS_OPTIONS, SUBSCRIPTION_PLAN_OPTIONS } from "./constants";
import type { CompanyPlanFilter, CompanyStatusFilter } from "./types";

const STATUS_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все статусы" },
  ...COMPANY_STATUS_OPTIONS.map((status) => ({ value: status, label: COMPANY_STATUS_LABELS[status] ?? status })),
];

const PLAN_OPTIONS: PopoverSelectOption[] = [
  { value: "", label: "Все тарифы" },
  ...SUBSCRIPTION_PLAN_OPTIONS.map((plan) => ({ value: plan, label: SUBSCRIPTION_PLAN_LABELS[plan] ?? plan })),
];

type AdminCompaniesFilterBarProps = {
  search: string;
  statusFilter: CompanyStatusFilter;
  planFilter: CompanyPlanFilter;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: CompanyStatusFilter) => void;
  onPlanChange: (value: CompanyPlanFilter) => void;
  onReset: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function AdminCompaniesFilterBar({
  search,
  statusFilter,
  planFilter,
  onSearchChange,
  onStatusChange,
  onPlanChange,
  onReset,
  onSubmit,
}: AdminCompaniesFilterBarProps) {
  return (
    <form className="admin-filter-bar" onSubmit={onSubmit}>
      <label className="admin-filter-field">
        <Search aria-hidden size={16} />
        <input
          aria-label="Поиск компаний"
          className="input"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по названию или ИНН"
          type="search"
          value={search}
        />
      </label>
      <PopoverSelect
        label="Статус"
        value={statusFilter}
        options={STATUS_OPTIONS}
        onChange={(value) => onStatusChange(value as CompanyStatusFilter)}
      />
      <PopoverSelect
        label="Тариф"
        value={planFilter}
        options={PLAN_OPTIONS}
        onChange={(value) => onPlanChange(value as CompanyPlanFilter)}
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
