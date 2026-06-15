import type { AdminDashboardSummary, AdminStaffSummary, PaginatedResponse } from "@ecoplatform/shared";
import { enc, type ApiRequestOptions, type PaginationInput } from "./endpoint-utils";
import { apiFetch } from "./requests";

type AdminNewsListInput = PaginationInput & { q?: string };

type AdminNewsListItem = {
  id: string;
  title: string;
  lead: string;
  slug: string;
  status: string;
  coverImageId: string | null;
  firstPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: Array<{ newsTagId: string; newsTag: { id: string; name: string; slug: string } }>;
  _count: { blocks: number; comments: number; likes: number };
};

type AdminNewsDetail = Omit<AdminNewsListItem, "_count"> & {
  blocks: Array<{ id: string; position: number; type: string; payload: Record<string, unknown> }>;
};

function adminNewsListSuffix(input: AdminNewsListInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  if (input.q?.trim()) query.set("q", input.q.trim());
  return query.toString() ? `?${query.toString()}` : "";
}

export const adminApi = {
  dashboard: (options: ApiRequestOptions = {}) =>
    apiFetch<AdminDashboardSummary>("/admin/dashboard", { token: options.token }),
  overview: (options: ApiRequestOptions = {}) =>
    apiFetch<AdminStaffSummary>("/admin/overview", { token: options.token }),
  news: {
    // Возвращает paginated envelope БЕЗ blocks (для таблицы).
    // Получение detail для редактора — `admin.news.get(id)`.
    list: (pagination: AdminNewsListInput = {}) =>
      apiFetch<PaginatedResponse<AdminNewsListItem>>(`/admin/content/news${adminNewsListSuffix(pagination)}`),
    get: (id: string) => apiFetch<AdminNewsDetail>(`/admin/content/news/${enc(id)}`),
  },
};
