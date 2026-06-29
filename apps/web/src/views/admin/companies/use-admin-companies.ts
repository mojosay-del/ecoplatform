"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { api, errorText } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import { ADMIN_COMPANIES_PAGE_SIZE, companySortSelectors, type CompanyStatusReason } from "./constants";
import type {
  AdminCompanyDetail,
  AdminCompanyListItem,
  CompanyFilters,
  CompanyPlanFilter,
  CompanySortKey,
  CompanyStatusFilter,
} from "./types";

type CompanyStatusMutationInput = {
  companyId: string;
  status: string;
  reasonCode: CompanyStatusReason;
  comment?: string;
};

const EMPTY_FILTERS: CompanyFilters = { search: "", status: "", plan: "" };

export function useAdminCompanies() {
  const { token } = useAuth();
  const [selected, setSelected] = useState<AdminCompanyDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyStatusFilter>("");
  const [planFilter, setPlanFilter] = useState<CompanyPlanFilter>("");
  const [filters, setFilters] = useState<CompanyFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortState<CompanySortKey>>({ key: "createdAt", direction: "desc" });
  const [nextStatus, setNextStatus] = useState<string>("active");
  const [statusReason, setStatusReason] = useState<CompanyStatusReason>("manual_activation");
  const [statusComment, setStatusComment] = useState("");

  const companiesQuery = useInfiniteApiQuery<AdminCompanyListItem>(
    token ? ["admin", "companies", filters.search, filters.status, filters.plan] : null,
    ADMIN_COMPANIES_PAGE_SIZE,
    async ({ limit, offset }) =>
      api.admin.companies.list(
        { limit, offset },
        { search: filters.search, status: filters.status, plan: filters.plan },
        { token },
      ),
  );

  const statusMutation = useMutation<AdminCompanyDetail, unknown, CompanyStatusMutationInput>({
    mutationFn: async (input) => {
      if (!token) throw new Error("Нет доступа.");
      return api.admin.companies.setStatus(
        input.companyId,
        { status: input.status, reasonCode: input.reasonCode, comment: input.comment },
        { token },
      );
    },
    onSuccess: (data) => {
      setSelected(data);
      setStatusComment("");
      setErrorMessage(null);
      companiesQuery.reload();
    },
  });

  const sortedCompanies = useMemo(
    () => sortItems(companiesQuery.items, sort, companySortSelectors),
    [companiesQuery.items, sort],
  );
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.plan);

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setPlanFilter("");
    setFilters(EMPTY_FILTERS);
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ search: search.trim(), status: statusFilter, plan: planFilter });
  }

  async function openCompany(id: string) {
    if (!token) return;
    try {
      const data = await api.admin.companies.get(id, { token });
      setSelected(data);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось загрузить компанию"));
    }
  }

  async function submitStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    try {
      await statusMutation.mutateAsync({
        companyId: selected.id,
        status: nextStatus,
        reasonCode: statusReason,
        comment: statusComment.trim() || undefined,
      });
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось сменить статус"));
    }
  }

  return {
    token,
    selected,
    errorMessage,
    search,
    statusFilter,
    planFilter,
    filters,
    sort,
    nextStatus,
    statusReason,
    statusComment,
    sortedCompanies,
    hasActiveFilters,
    companiesQuery,
    applyFilters,
    resetFilters,
    openCompany,
    submitStatus,
    setSearch,
    setStatusFilter,
    setPlanFilter,
    setSort,
    setNextStatus,
    setStatusReason,
    setStatusComment,
  };
}
