import type { PaginatedResponse } from "@ecoplatform/shared";

export type AdminUserListItem = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  status: "active" | "blocked";
  createdAt: string;
  company: { id: string; organizationName: string; status: string } | null;
  platformStaff: { roles: string[]; isActive: boolean } | null;
};

export type AdminUserList = PaginatedResponse<AdminUserListItem>;
export type UserSortKey = "name" | "status" | "company" | "role" | "phone" | "createdAt";

export type AdminUserDetail = AdminUserListItem & {
  updatedAt: string;
  activeRestrictions: Array<{
    id: string;
    moduleCode: string;
    expiresAt: string;
    reasonCode: string;
    comment: string | null;
  }>;
  recentSessions: Array<{
    id: string;
    userAgent: string | null;
    ipAddress: string | null;
    createdAt: string;
    expiresAt: string;
    revokedAt: string | null;
  }>;
};

export type AdminUserSession = AdminUserDetail["recentSessions"][number];
