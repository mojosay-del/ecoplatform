import type { PaginatedResponse } from "@ecoplatform/shared";

export type PaginationInput = {
  limit?: number;
  offset?: number;
  page?: number;
  take?: number;
};

export type ResolvedPagination = {
  limit: number;
  offset: number;
};

export function resolvePagination(
  input: PaginationInput = {},
  config: { defaultLimit: number; maxLimit: number },
): ResolvedPagination {
  const rawLimit = input.limit ?? input.take ?? config.defaultLimit;
  const integerLimit = Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : config.defaultLimit;
  const limit = Math.min(Math.max(integerLimit, 1), config.maxLimit);

  const rawPage = Number.isFinite(input.page) ? Math.trunc(input.page!) : undefined;
  const rawOffset = input.offset ?? (rawPage !== undefined ? (rawPage - 1) * limit : 0);
  const offset = Math.max(Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : 0, 0);

  return { limit, offset };
}

export function paginatedResponse<T>(items: T[], total: number, pagination: ResolvedPagination): PaginatedResponse<T> {
  return {
    items,
    total,
    hasMore: pagination.offset + items.length < total,
  };
}

// Вариант без дорогого count() на растущих таблицах (журнал действий и т.п.).
// Вызывающий выбирает `limit + 1` строку; «лишняя» строка означает, что есть
// ещё страница. `total` не вычисляем — отдаём нижнюю границу (offset + отдано),
// её потребители infinite-scroll не показывают, ориентируясь на `hasMore`.
export function paginatedResponseByOverfetch<T>(rows: T[], pagination: ResolvedPagination): PaginatedResponse<T> {
  const hasMore = rows.length > pagination.limit;
  const items = hasMore ? rows.slice(0, pagination.limit) : rows;
  return {
    items,
    total: pagination.offset + items.length,
    hasMore,
  };
}
