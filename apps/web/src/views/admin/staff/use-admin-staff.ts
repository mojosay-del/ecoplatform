"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { apiFetch, errorText } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { formatPlatformRoles } from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import { ADMIN_STAFF_PAGE_SIZE, EMPTY_CREATE_STAFF_FORM, EMPTY_STAFF_FILTERS, staffSortSelectors } from "./constants";
import type {
  CreateStaffForm,
  StaffFilters,
  StaffItem,
  StaffPatch,
  StaffRoleFilter,
  StaffSortKey,
  StaffStatusFilter,
} from "./types";

type StaffMutationInput = {
  userId: string;
  patch: StaffPatch;
};

type StaffListResponse = {
  items: StaffItem[];
  total: number;
  hasMore: boolean;
};

export function useAdminStaff() {
  const { token } = useAuth();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StaffStatusFilter>("");
  const [roleFilter, setRoleFilter] = useState<StaffRoleFilter>("");
  const [filters, setFilters] = useState<StaffFilters>(EMPTY_STAFF_FILTERS);
  const [sort, setSort] = useState<SortState<StaffSortKey>>({ key: "createdAt", direction: "desc" });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateStaffForm>(EMPTY_CREATE_STAFF_FORM);

  const staffQuery = useInfiniteApiQuery<StaffItem>(
    token ? "admin-staff" : null,
    ADMIN_STAFF_PAGE_SIZE,
    async ({ limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      return apiFetch<StaffListResponse>(`/admin/staff?${query}`, { token });
    },
  );

  const createMutation = useMutation({
    mutationFn: async (form: CreateStaffForm) => {
      if (!token) throw new Error("Нет доступа.");
      return apiFetch("/admin/staff", {
        method: "POST",
        token,
        body: { ...form, gender: form.gender || null },
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      setCreateForm(EMPTY_CREATE_STAFF_FORM);
      setErrorMessage(null);
      staffQuery.reload();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ userId, patch }: StaffMutationInput) => {
      if (!token) throw new Error("Нет доступа.");
      return apiFetch(`/admin/staff/${userId}`, { method: "PATCH", token, body: patch });
    },
    onSuccess: () => {
      setErrorMessage(null);
      staffQuery.reload();
    },
  });

  const filteredItems = useMemo(() => filterStaffItems(staffQuery.items, filters), [filters, staffQuery.items]);
  const sortedItems = useMemo(() => sortItems(filteredItems, sort, staffSortSelectors), [filteredItems, sort]);
  const hasActiveFilters = Boolean(filters.search || filters.status || filters.role);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilters({ search: search.trim(), status: statusFilter, role: roleFilter });
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setRoleFilter("");
    setFilters(EMPTY_STAFF_FILTERS);
  }

  async function createStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await createMutation.mutateAsync(createForm);
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось создать сотрудника"));
    }
  }

  async function updateStaff(userId: string, patch: StaffPatch) {
    try {
      await updateMutation.mutateAsync({ userId, patch });
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось обновить сотрудника"));
    }
  }

  return {
    token,
    errorMessage,
    search,
    statusFilter,
    roleFilter,
    sort,
    createOpen,
    createForm,
    sortedItems,
    hasActiveFilters,
    staffQuery,
    applyFilters,
    resetFilters,
    createStaff,
    updateStaff,
    setSearch,
    setStatusFilter,
    setRoleFilter,
    setSort,
    setCreateOpen,
    setCreateForm,
  };
}

function filterStaffItems(items: StaffItem[], filters: StaffFilters): StaffItem[] {
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
}
