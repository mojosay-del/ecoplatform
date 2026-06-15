"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type FileAsset } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { RenderableBlock } from "./content-block-types";

export function useFileAssets(blocks: RenderableBlock[]) {
  const { token } = useAuth();
  const [assets, setAssets] = useState<Map<string, FileAsset>>(new Map());
  const [resolvedIdsKey, setResolvedIdsKey] = useState("");
  const ids = useMemo(() => collectFileIds(blocks), [blocks]);
  const idsKey = ids.join(",");
  const isLoading = ids.length > 0 && resolvedIdsKey !== idsKey;

  useEffect(() => {
    if (!token || ids.length === 0) {
      setAssets(new Map());
      setResolvedIdsKey(idsKey);
      return;
    }

    let isActive = true;
    setResolvedIdsKey("");
    api.files
      .listByIds(ids)
      .then((result) => {
        if (!isActive) return;
        setAssets(new Map(result.map((asset) => [asset.id, asset])));
      })
      .catch(() => {
        if (!isActive) return;
        setAssets(new Map());
      })
      .finally(() => {
        if (isActive) setResolvedIdsKey(idsKey);
      });

    return () => {
      isActive = false;
    };
  }, [ids.length, idsKey, token]);

  return { assets, isLoading };
}

function collectFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (
      typeof payload.image === "object" &&
      payload.image &&
      "fileId" in payload.image &&
      typeof payload.image.fileId === "string"
    ) {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}

export function collectContentBlockImageFileIds(blocks: RenderableBlock[]) {
  const ids = new Set<string>();
  for (const block of blocks) {
    const payload = block.payload as Record<string, unknown>;
    if (block.type === "image" && typeof payload.fileId === "string" && payload.fileId) {
      ids.add(payload.fileId);
    }
    if (block.type === "gallery" && Array.isArray(payload.images)) {
      for (const image of payload.images) {
        if (typeof image === "object" && image && "fileId" in image && typeof image.fileId === "string") {
          ids.add(image.fileId);
        }
      }
    }
    if (
      block.type === "image_checklist" &&
      typeof payload.image === "object" &&
      payload.image &&
      "fileId" in payload.image &&
      typeof payload.image.fileId === "string"
    ) {
      ids.add(payload.image.fileId);
    }
  }

  return Array.from(ids).sort();
}
