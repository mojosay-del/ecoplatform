"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type FileAsset } from "./api";
import { useAuth } from "./auth";
import { queryKeys } from "./query";

// Батчит загрузку обложек по списку элементов, у каждого из которых может быть
// coverImageId. Возвращает Map<assetId, FileAsset>. Используется в каталогах
// новостей, обучения и любых других списках с превью.
export function useCoverAssets(items: Array<{ coverImageId?: string | null }>) {
  const ids = useMemo(
    () => Array.from(new Set(items.map((item) => item.coverImageId).filter((id): id is string => Boolean(id)))).sort(),
    [items],
  );
  return useFileAssetsByIds(ids);
}

export function useFileAssetsByIds(ids: string[]) {
  const { token } = useAuth();
  const normalizedIds = useMemo(() => Array.from(new Set(ids.filter(Boolean))).sort(), [ids]);
  const idsKey = useMemo(() => normalizedIds.join(","), [normalizedIds]);
  const query = useQuery({
    queryKey: queryKeys.files.byIds(normalizedIds),
    queryFn: () => apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(idsKey)}`, { token }),
    enabled: Boolean(token && idsKey),
    staleTime: 5 * 60_000,
  });

  return useMemo(() => new Map((query.data ?? []).map((asset) => [asset.id, asset])), [query.data]);
}
