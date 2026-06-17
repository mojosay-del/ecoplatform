"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ForumAdminQuestionItem,
  ForumQuestionStatus,
  ForumTaxonomy,
  ForumTaxonomyValue,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { ApiError, apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

export type AdminForumState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
export type ForumAxis = "raw-materials" | "question-types";

const BASE = "/admin/content/forum";
const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };

type SeedInput = { title: string; body: string; rawMaterialId: string; questionTypeId: string };

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

// Состояние и операции CMS-экрана «Форум»: справочники (две оси), список вопросов
// с фильтром и быстрая модерация, засев. View остаётся тонким. Права инфорсит
// бэкенд; кнопки в UI дополнительно гейтятся по роли (canManageTaxonomy/canModerate).
export function useAdminForum() {
  const { token, user } = useAuth();
  const [state, setState] = useState<AdminForumState>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<ForumTaxonomy>(EMPTY_TAXONOMY);
  const [questions, setQuestions] = useState<ForumAdminQuestionItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<ForumQuestionStatus | "">("");

  const roles = user?.platformRoles ?? [];
  const canManageTaxonomy = roles.includes("admin") || roles.includes("content_manager");
  const canModerate = roles.includes("admin") || roles.includes("moderator");

  const loadQuestions = useCallback(
    async (status: ForumQuestionStatus | "") => {
      if (!token) return;
      const suffix = status ? `?status=${status}&limit=100` : "?limit=100";
      const page = await apiFetch<PaginatedResponse<ForumAdminQuestionItem>>(`${BASE}/questions${suffix}`, { token });
      setQuestions(page.items);
    },
    [token],
  );

  const loadAll = useCallback(async () => {
    if (!token) {
      setState("unauthenticated");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const tax = await apiFetch<ForumTaxonomy>(`${BASE}/taxonomy`, { token });
      setTaxonomy(tax);
      await loadQuestions(statusFilter);
      setState("ready");
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setState("forbidden");
        return;
      }
      setState("error");
      setMessage(messageFrom(error, "Не удалось загрузить раздел форума."));
    }
  }, [loadQuestions, statusFilter, token]);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const changeStatusFilter = useCallback(
    async (next: ForumQuestionStatus | "") => {
      setStatusFilter(next);
      try {
        await loadQuestions(next);
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось обновить список."));
      }
    },
    [loadQuestions],
  );

  const reloadTaxonomy = useCallback(async () => {
    if (!token) return;
    const tax = await apiFetch<ForumTaxonomy>(`${BASE}/taxonomy`, { token });
    setTaxonomy(tax);
  }, [token]);

  const createValue = useCallback(
    async (axis: ForumAxis, label: string) => {
      if (!token || !label.trim()) return;
      try {
        await apiFetch<ForumTaxonomyValue>(`${BASE}/${axis}`, { method: "POST", token, body: { label: label.trim() } });
        await reloadTaxonomy();
        setMessage("Значение добавлено.");
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось добавить значение."));
      }
    },
    [reloadTaxonomy, token],
  );

  const renameValue = useCallback(
    async (axis: ForumAxis, id: string, label: string) => {
      if (!token || !label.trim()) return;
      try {
        await apiFetch(`${BASE}/${axis}/${id}`, { method: "PATCH", token, body: { label: label.trim() } });
        await reloadTaxonomy();
        setMessage("Значение переименовано.");
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось переименовать значение."));
      }
    },
    [reloadTaxonomy, token],
  );

  const deleteValue = useCallback(
    async (axis: ForumAxis, id: string) => {
      if (!token) return;
      const axisLabel = axis === "raw-materials" ? "вид сырья" : "тип вопроса";
      if (!window.confirm(`Удалить ${axisLabel}? Тег пропадёт у вопросов, где он стоял, но сами вопросы останутся.`)) {
        return;
      }
      try {
        const result = await apiFetch<{ ok: true; affectedQuestions: number }>(`${BASE}/${axis}/${id}`, {
          method: "DELETE",
          token,
        });
        await Promise.all([reloadTaxonomy(), loadQuestions(statusFilter)]);
        setMessage(`Значение удалено. Затронуто вопросов: ${result.affectedQuestions}.`);
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось удалить значение."));
      }
    },
    [loadQuestions, reloadTaxonomy, statusFilter, token],
  );

  const moderate = useCallback(
    async (action: "hide" | "restore" | "delete", id: string) => {
      if (!token) return;
      if (action === "delete" && !window.confirm("Удалить вопрос вместе со всеми ответами?")) {
        return;
      }
      try {
        if (action === "delete") {
          await apiFetch(`${BASE}/questions/${id}`, { method: "DELETE", token });
        } else {
          await apiFetch(`${BASE}/questions/${id}/${action}`, { method: "POST", token });
        }
        await loadQuestions(statusFilter);
        setMessage(
          action === "delete" ? "Вопрос удалён." : action === "hide" ? "Вопрос скрыт." : "Вопрос восстановлен.",
        );
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось выполнить действие."));
      }
    },
    [loadQuestions, statusFilter, token],
  );

  const seedQuestion = useCallback(
    async (input: SeedInput) => {
      if (!token) return false;
      try {
        await apiFetch<{ id: string }>(`${BASE}/questions`, { method: "POST", token, body: input });
        await loadQuestions(statusFilter);
        setMessage("Вопрос засеян.");
        return true;
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось засеять вопрос."));
        return false;
      }
    },
    [loadQuestions, statusFilter, token],
  );

  return useMemo(
    () => ({
      state,
      message,
      taxonomy,
      questions,
      statusFilter,
      canManageTaxonomy,
      canModerate,
      changeStatusFilter,
      createValue,
      renameValue,
      deleteValue,
      moderate,
      seedQuestion,
      setMessage,
    }),
    [
      canManageTaxonomy,
      canModerate,
      changeStatusFilter,
      createValue,
      deleteValue,
      message,
      moderate,
      questions,
      renameValue,
      seedQuestion,
      state,
      statusFilter,
      taxonomy,
    ],
  );
}
