"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { sortItems, type SortState } from "../../../components/admin-table-utils";
import { api, errorText } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { formatPlatformRoles } from "../../../lib/display-labels";
import { useInfiniteApiQuery } from "../../../lib/use-infinite-api-query";
import {
  ADMIN_STAFF_PAGE_SIZE,
  EMPTY_CREATE_STAFF_FORM,
  EMPTY_STAFF_FILTERS,
  generateTempPassword,
  staffSortSelectors,
} from "./constants";
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
  // Окно с одноразовым показом сброшенного пароля.
  const [resetResult, setResetResult] = useState<{ staff: StaffItem; password: string } | null>(null);

  const staffQuery = useInfiniteApiQuery<StaffItem>(
    token ? "admin-staff" : null,
    ADMIN_STAFF_PAGE_SIZE,
    async ({ limit, offset }) => api.admin.staff.list({ limit, offset }, { token }),
  );

  const createMutation = useMutation({
    mutationFn: async (form: CreateStaffForm) => {
      if (!token) throw new Error("Нет доступа.");
      return api.admin.staff.create({ ...form, gender: form.gender || null }, { token });
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
      return api.admin.staff.update(userId, patch, { token });
    },
    onSuccess: () => {
      setErrorMessage(null);
      staffQuery.reload();
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      if (!token) throw new Error("Нет доступа.");
      return api.admin.staff.resetPassword(userId, password, { token });
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

  async function resetPassword(staff: StaffItem) {
    const password = generateTempPassword();
    try {
      await resetPasswordMutation.mutateAsync({ userId: staff.userId, password });
      setErrorMessage(null);
      setResetResult({ staff, password });
    } catch (error) {
      setErrorMessage(errorText(error, "Не удалось сбросить пароль"));
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
    resetResult,
    applyFilters,
    resetFilters,
    createStaff,
    updateStaff,
    resetPassword,
    closeReset: () => setResetResult(null),
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
