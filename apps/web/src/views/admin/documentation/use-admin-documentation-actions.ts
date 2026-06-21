"use client";

import { useCallback, useState, type FormEvent } from "react";
import { apiFetch, errorText } from "../../../lib/api";
import { useCmsAutosave, useUnsavedChangesWarning } from "../../../lib/cms-autosave";
import { DOC_CATEGORY_ICON_TYPE, DOC_LIST_PATH, EMPTY_DOCUMENT_DRAFT } from "./constants";
import { buildDocumentationSaveBody, buildDraftFromArticle } from "./documentation-draft.helpers";
import type { DocArticle, SetDocDraft } from "./types";
import { documentationDisplayIconNameForNode } from "../../documentation-icons";
import { isDocCategory } from "./utils";

export function useAdminDocumentationActions({
  autosaveEnabled,
  categories,
  draft,
  expandCategory,
  hasChanges,
  original,
  reload,
  setDraft,
  startNewDocument,
  token,
}: {
  autosaveEnabled: boolean;
  categories: DocArticle[];
  draft: DocArticleDraft;
  expandCategory: (id: string) => void;
  hasChanges: boolean;
  original: DocArticle | null;
  reload: () => Promise<DocArticle[]>;
  setDraft: SetDocDraft;
  startNewDocument: (categoryId: string, nextPosition?: number) => void;
  token: string | null;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const createCategory = useCallback(
    async (title: string) => {
      if (!token) {
        setMessage("Войдите как администратор или контент-менеджер.");
        return false;
      }
      try {
        const category = await apiFetch<DocArticle>(DOC_LIST_PATH, {
          method: "POST",
          token,
          body: {
            parentId: null,
            title: title.trim(),
            position: categories.length,
            iconType: DOC_CATEGORY_ICON_TYPE,
            displayIcon: documentationDisplayIconNameForNode({ title: title.trim() || "Раздел" }),
            blocks: [],
          },
        });
        await reload();
        expandCategory(category.id);
        setDraft(buildDraftFromArticle(category));
        setMessage("Раздел создан.");
        return true;
      } catch (error) {
        setMessage(errorText(error, "Не удалось создать раздел."));
        return false;
      }
    },
    [categories.length, expandCategory, reload, setDraft, token],
  );

  const persistDocDraft = useCallback(async () => {
    if (!token) throw new Error("Нет активной сессии.");
    if (draft.kind === "document" && !draft.parentId) {
      throw new Error("Выберите раздел для документа.");
    }

    const body = buildDocumentationSaveBody(draft);
    let saved: DocArticle | null = null;

    if (draft.id) {
      await apiFetch(`${DOC_LIST_PATH}/${draft.id}`, { method: "PATCH", token, body });
      if (
        draft.kind === "document" &&
        original &&
        (original.parentId !== draft.parentId || original.position !== draft.position)
      ) {
        await apiFetch(`${DOC_LIST_PATH}/${draft.id}/move`, {
          method: "PATCH",
          token,
          body: { parentId: draft.parentId, position: draft.position },
        });
      }
    } else {
      saved = await apiFetch<DocArticle>(DOC_LIST_PATH, { method: "POST", token, body });
    }

    setDraft((prev) => (prev.markRevised ? { ...prev, markRevised: false } : prev));

    const nextItems = await reload();
    return { items: nextItems, saved };
  }, [draft, original, reload, setDraft, token]);

  const submit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!token) return;
      setSubmitting(true);
      setMessage(null);
      try {
        const wasNew = !draft.id;
        const parentId = draft.parentId;
        const label = draft.kind === "category" ? "Раздел" : "Документ";
        const result = await persistDocDraft();
        setMessage(draft.id ? `${label} обновлён.` : `${label} создан как черновик.`);
        if (wasNew && draft.kind === "document" && parentId) {
          const nextPosition = result.items.filter((item) => !isDocCategory(item) && item.parentId === parentId).length;
          startNewDocument(parentId, nextPosition);
        }
      } catch (error) {
        setMessage(errorText(error, "Не удалось сохранить документ."));
      } finally {
        setSubmitting(false);
      }
    },
    [draft, persistDocDraft, startNewDocument, token],
  );

  const publishToggle = useCallback(
    async (article: DocArticle) => {
      if (!token) return;
      if (draft.id === article.id && hasChanges) {
        try {
          await persistDocDraft();
        } catch (error) {
          setMessage(errorText(error, "Не удалось сохранить перед публикацией."));
          return;
        }
      }
      const path =
        article.status === "published"
          ? `${DOC_LIST_PATH}/${article.id}/unpublish`
          : `${DOC_LIST_PATH}/${article.id}/publish`;
      const label = isDocCategory(article) ? "Раздел" : "Документ";
      try {
        await apiFetch(path, { method: "POST", token });
        await reload();
        setMessage(article.status === "published" ? `${label} снят с публикации.` : `${label} опубликован.`);
      } catch (error) {
        setMessage(errorText(error, "Не удалось изменить статус."));
      }
    },
    [draft.id, hasChanges, persistDocDraft, reload, token],
  );

  const remove = useCallback(
    async (article: DocArticle) => {
      if (!token) return;
      const label = isDocCategory(article) ? "раздел" : "документ";
      if (!confirm(`Удалить ${label} «${article.title}»? Если есть дочерние — сначала переместите или удалите их.`)) {
        return;
      }
      try {
        await apiFetch(`${DOC_LIST_PATH}/${article.id}`, { method: "DELETE", token });
        await reload();
        if (draft.id === article.id) setDraft(EMPTY_DOCUMENT_DRAFT);
        setMessage(isDocCategory(article) ? "Раздел удалён." : "Документ удалён.");
      } catch (error) {
        setMessage(errorText(error, "Не удалось удалить запись."));
      }
    },
    [draft.id, reload, setDraft, token],
  );

  const docAutosave = useCmsAutosave({
    enabled: autosaveEnabled && !submitting,
    hasChanges,
    onSave: persistDocDraft,
  });

  useUnsavedChangesWarning(Boolean(draft.id) && hasChanges);

  return {
    createCategory,
    docAutosave,
    message,
    persistDocDraft,
    publishToggle,
    remove,
    setMessage,
    submit,
    submitting,
  };
}

type DocArticleDraft = Parameters<typeof buildDocumentationSaveBody>[0];
