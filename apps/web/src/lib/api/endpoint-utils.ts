export type PaginationInput = { limit?: number; offset?: number };
export type ApiRequestOptions = { token?: string | null };
export type PreviewRequestOptions = ApiRequestOptions & { preview?: boolean };

// Лайки и комментарии возвращают одинаковую полезную нагрузку — выносим.
export type LikeResult = {
  liked: boolean;
  likesCount: number;
};

export function enc(value: string): string {
  // encodeURIComponent для всех динамических сегментов URL: пользовательский
  // slug / id могут содержать спецсимволы. Раньше эта обёртка использовалась
  // непоследовательно.
  return encodeURIComponent(value);
}

export function paginationSuffix(pagination: PaginationInput = {}) {
  const query = new URLSearchParams();
  if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
  if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
  return query.toString() ? `?${query.toString()}` : "";
}

export function previewSuffix(options: { preview?: boolean } = {}) {
  return options.preview ? "?preview=1" : "";
}
