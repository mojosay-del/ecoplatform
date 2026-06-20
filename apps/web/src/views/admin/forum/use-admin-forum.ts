"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  ForumAdminQuestionItem,
  ForumQuestionStatus,
  ForumTaxonomy,
  ForumTaxonomyValue,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { ApiError, apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery, type ApiState } from "../../shared";

export type AdminForumState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
export type ForumAxis = "raw-materials" | "question-types";

const BASE = "/admin/content/forum";
const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };

type SeedInput = { title: string; body: string; rawMaterialId: string; questionTypeId: string };

function messageFrom(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : fallback;
}

// Сводим состояния двух запросов (справочники + вопросы) в одно для экрана.
function combineState(a: ApiState, b: ApiState): AdminForumState {
  if (a === "unauthenticated" || b === "unauthenticated") return "unauthenticated";
  if (a === "forbidden" || b === "forbidden") return "forbidden";
  if (a === "error" || b === "error") return "error";
  if (a === "loading" || b === "loading") return "loading";
  return "ready";
}

// Состояние и операции CMS-экрана «Форум»: справочники (две оси), список вопросов
// с фильтром и быстрая модерация, засев. View остаётся тонким. Права инфорсит
// бэкенд; кнопки в UI дополнительно гейтятся по роли (canManageTaxonomy/canModerate).
export function useAdminForum() {
  const { user } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ForumQuestionStatus | "">("");

  const roles = user?.platformRoles ?? [];
  const canManageTaxonomy = roles.includes("admin") || roles.includes("content_manager");
  const canModerate = roles.includes("admin") || roles.includes("moderator");

  const taxonomyQuery = useApiQuery<ForumTaxonomy>(
    queryKeys.admin.forumTaxonomy(),
    () => apiFetch<ForumTaxonomy>(`${BASE}/taxonomy`),
    EMPTY_TAXONOMY,
  );
  // Ключ включает фильтр → смена фильтра сама триггерит запрос; keepPreviousData
  // держит прежний список на время рефетча (без мигания в "Загрузка…").
  const questionsQuery = useApiQuery<ForumAdminQuestionItem[]>(
    queryKeys.admin.forumQuestions(statusFilter),
    async () => {
      const suffix = statusFilter ? `?status=${statusFilter}&limit=100` : "?limit=100";
      return (await apiFetch<PaginatedResponse<ForumAdminQuestionItem>>(`${BASE}/questions${suffix}`)).items;
    },
    [],
    { keepPreviousData: true },
  );

  const taxonomy = taxonomyQuery.data;
  const questions = questionsQuery.data;
  const state = combineState(taxonomyQuery.state, questionsQuery.state);
  const reloadTaxonomy = taxonomyQuery.refetch;
  const reloadQuestions = questionsQuery.refetch;

  const changeStatusFilter = useCallback((next: ForumQuestionStatus | "") => {
    // Запрос перезагрузится сам — ключ зависит от statusFilter.
    setStatusFilter(next);
  }, []);

  const createValue = useCallback(
    async (axis: ForumAxis, label: string) => {
      if (!label.trim()) return;
      try {
        await apiFetch<ForumTaxonomyValue>(`${BASE}/${axis}`, { method: "POST", body: { label: label.trim() } });
        await reloadTaxonomy();
        setMessage("Значение добавлено.");
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось добавить значение."));
      }
    },
    [reloadTaxonomy],
  );

  const renameValue = useCallback(
    async (axis: ForumAxis, id: string, label: string) => {
      if (!label.trim()) return;
      try {
        await apiFetch(`${BASE}/${axis}/${id}`, { method: "PATCH", body: { label: label.trim() } });
        await reloadTaxonomy();
        setMessage("Значение переименовано.");
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось переименовать значение."));
      }
    },
    [reloadTaxonomy],
  );

  const deleteValue = useCallback(
    async (axis: ForumAxis, id: string) => {
      const axisLabel = axis === "raw-materials" ? "вид сырья" : "тип вопроса";
      if (!window.confirm(`Удалить ${axisLabel}? Тег пропадёт у вопросов, где он стоял, но сами вопросы останутся.`)) {
        return;
      }
      try {
        const result = await apiFetch<{ ok: true; affectedQuestions: number }>(`${BASE}/${axis}/${id}`, {
          method: "DELETE",
        });
        await Promise.all([reloadTaxonomy(), reloadQuestions()]);
        setMessage(`Значение удалено. Затронуто вопросов: ${result.affectedQuestions}.`);
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось удалить значение."));
      }
    },
    [reloadQuestions, reloadTaxonomy],
  );

  const moderate = useCallback(
    async (action: "hide" | "restore" | "delete", id: string) => {
      if (action === "delete" && !window.confirm("Удалить вопрос вместе со всеми ответами?")) {
        return;
      }
      try {
        if (action === "delete") {
          await apiFetch(`${BASE}/questions/${id}`, { method: "DELETE" });
        } else {
          await apiFetch(`${BASE}/questions/${id}/${action}`, { method: "POST" });
        }
        await reloadQuestions();
        setMessage(
          action === "delete" ? "Вопрос удалён." : action === "hide" ? "Вопрос скрыт." : "Вопрос восстановлен.",
        );
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось выполнить действие."));
      }
    },
    [reloadQuestions],
  );

  const seedQuestion = useCallback(
    async (input: SeedInput) => {
      try {
        await apiFetch<{ id: string }>(`${BASE}/questions`, { method: "POST", body: input });
        await reloadQuestions();
        setMessage("Вопрос засеян.");
        return true;
      } catch (error) {
        setMessage(messageFrom(error, "Не удалось засеять вопрос."));
        return false;
      }
    },
    [reloadQuestions],
  );

  const displayMessage = message ?? taxonomyQuery.errorMessage ?? questionsQuery.errorMessage;

  return useMemo(
    () => ({
      state,
      message: displayMessage,
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
      displayMessage,
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
