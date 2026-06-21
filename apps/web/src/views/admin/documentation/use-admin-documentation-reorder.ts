"use client";

import { useCallback } from "react";
import { PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { apiFetch } from "../../../lib/api";
import { DOC_LIST_PATH } from "./constants";
import type { DocArticle, SetDocDraft } from "./types";
import type { SetDocumentationItems } from "./use-admin-documentation-list";

export function useAdminDocumentationReorder({
  documentsByCategory,
  reload,
  setDraft,
  setItems,
  setMessage,
  token,
}: {
  documentsByCategory: Map<string, DocArticle[]>;
  reload: () => Promise<DocArticle[]>;
  setDraft: SetDocDraft;
  setItems: SetDocumentationItems;
  setMessage: (message: string | null) => void;
  token: string | null;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const reorderDocuments = useCallback(
    async (categoryId: string, event: DragEndEvent) => {
      if (!token) return;
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const documents = documentsByCategory.get(categoryId) ?? [];
      const from = documents.findIndex((item) => item.id === String(active.id));
      const to = documents.findIndex((item) => item.id === String(over.id));
      if (from === -1 || to === -1) return;

      const ordered = arrayMove(documents, from, to);
      const positions = new Map(ordered.map((item, position) => [item.id, position]));
      setItems((prev) =>
        prev.map((item) => (positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)),
      );
      setDraft((prev) =>
        prev.id && positions.has(prev.id) ? { ...prev, parentId: categoryId, position: positions.get(prev.id)! } : prev,
      );

      try {
        await apiFetch(`${DOC_LIST_PATH}/${active.id}/move`, {
          method: "PATCH",
          token,
          body: { parentId: categoryId, position: to },
        });
        await reload();
        setMessage("Порядок документов сохранён.");
      } catch (error) {
        await reload();
        setMessage(
          error instanceof Error
            ? `Не удалось сохранить порядок: ${error.message}. Список обновлён с сервера.`
            : "Не удалось сохранить порядок документов. Список обновлён с сервера.",
        );
      }
    },
    [documentsByCategory, reload, setDraft, setItems, setMessage, token],
  );

  return {
    reorderDocuments,
    sensors,
  };
}
