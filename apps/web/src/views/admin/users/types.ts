import type { AdminUserDetail, AdminUserListItem, PaginatedResponse } from "@ecoplatform/shared";

// Каноничные типы ответов — в shared (api-response.ts); реэкспортируем под
// привычными именами, чтобы не трогать импорты компонентов домена.
export type { AdminUserDetail, AdminUserListItem };

export type AdminUserList = PaginatedResponse<AdminUserListItem>;
export type UserSortKey = "name" | "status" | "company" | "role" | "phone" | "createdAt";

export type AdminUserSession = AdminUserDetail["recentSessions"][number];
