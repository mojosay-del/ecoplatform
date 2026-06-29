import type { PlatformRole } from "@ecoplatform/shared";

// Каноничный тип ответа — в shared (api-response.ts). Локально сохраняем
// привычное имя StaffItem, чтобы не трогать импорты компонентов.
export type { AdminStaffItem as StaffItem } from "@ecoplatform/shared";

export type StaffSortKey = "name" | "status" | "role" | "email" | "createdAt";
export type StaffStatusFilter = "" | "active" | "inactive";
export type StaffRoleFilter = "" | PlatformRole;

export type StaffFilters = {
  search: string;
  status: StaffStatusFilter;
  role: StaffRoleFilter;
};

export type CreateStaffForm = {
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  gender: "" | "male" | "female";
  password: string;
  roles: string[];
};

export type StaffPatch = {
  roles?: string[];
  isActive?: boolean;
};
