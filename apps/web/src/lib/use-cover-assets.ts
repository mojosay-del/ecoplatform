"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, type FileAsset } from "./api";
import { useAuth } from "./auth";

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
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const idsKey = useMemo(
    () =>
      Array.from(new Set(ids.filter(Boolean)))
        .sort()
        .join(","),
    [ids],
  );

  useEffect(() => {
    if (!token || !idsKey) {
      setAssets(new Map());
      return;
    }
    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(idsKey)}`, { token })
      .then((result) => setAssets(new Map(result.map((asset) => [asset.id, asset]))))
      .catch(() => setAssets(new Map()));
  }, [idsKey, token]);

  return assets;
}
