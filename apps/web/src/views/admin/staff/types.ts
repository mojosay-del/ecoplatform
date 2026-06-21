import type { PlatformRole } from "@ecoplatform/shared";

export type StaffItem = {
  id: string;
  userId: string;
  roles: string[];
  isActive: boolean;
  createdAt: string;
  user: {
    id: string;
    email: string;
    phone: string;
    firstName: string;
    lastName: string;
    gender: "male" | "female" | null;
    status: string;
    createdAt: string;
  };
};

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
