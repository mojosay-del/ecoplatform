import type { FormEvent } from "react";
import { RotateCcw, Search } from "lucide-react";
import { COMPANY_STATUS_LABELS, SUBSCRIPTION_PLAN_LABELS } from "../../../lib/display-labels";
import { COMPANY_STATUS_OPTIONS, SUBSCRIPTION_PLAN_OPTIONS } from "./constants";
import type { CompanyPlanFilter, CompanyStatusFilter } from "./types";

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
      <select
        className="select"
        onChange={(event) => onStatusChange(event.target.value as CompanyStatusFilter)}
        value={statusFilter}
      >
        <option value="">Все статусы</option>
        {COMPANY_STATUS_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {COMPANY_STATUS_LABELS[status] ?? status}
          </option>
        ))}
      </select>
      <select
        className="select"
        onChange={(event) => onPlanChange(event.target.value as CompanyPlanFilter)}
        value={planFilter}
      >
        <option value="">Все тарифы</option>
        {SUBSCRIPTION_PLAN_OPTIONS.map((plan) => (
          <option key={plan} value={plan}>
            {SUBSCRIPTION_PLAN_LABELS[plan] ?? plan}
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
