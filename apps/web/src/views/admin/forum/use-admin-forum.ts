"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import type {
  ForumAdminQuestionItem,
  ForumQuestionStatus,
  ForumTaxonomy,
  ForumTaxonomyValue,
} from "@ecoplatform/shared";
import { errorText, apiFetch } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { queryKeys } from "../../../lib/query/keys";
import { useApiQuery, type ApiState } from "../../shared";
import { useInfiniteApiQuery, type InfiniteApiState } from "../../../lib/use-infinite-api-query";

export type AdminForumState = "unauthenticated" | "forbidden" | "loading" | "ready" | "error";
export type ForumAxis = "raw-materials" | "question-types";

const BASE = "/admin/content/forum";
const EMPTY_TAXONOMY: ForumTaxonomy = { rawMaterials: [], questionTypes: [] };

type SeedInput = { title: string; body: string; rawMaterialId: string; questionTypeId: string };

// Сводим состояния двух запросов (справочники + вопросы) в одно для экрана.
function combineState(a: ApiState, b: ApiState): AdminForumState {
  if (a === "unauthenticated" || b === "unauthenticated") return "unauthenticated";
  if (a === "forbidden" || b === "forbidden") return "forbidden";
  if (a === "error" || b === "error") return "error";
  if (a === "loading" || b === "loading") return "loading";
  return "ready";
}

function fromInfiniteState(state: InfiniteApiState): ApiState {
  return state === "idle" ? "loading" : state;
}

// Состояние и операции CMS-экрана «Форум»: справочники (две оси), список вопросов
// с фильтром/поиском и быстрая модерация, засев. View остаётся тонким. Права
// инфорсит бэкенд; кнопки в UI дополнительно гейтятся по роли.
export function useAdminForum() {
  const { user, token } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ForumQuestionStatus | "">("");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const roles = user?.platformRoles ?? [];
  const canManageTaxonomy = roles.includes("admin") || roles.includes("content_manager");
  const canModerate = roles.includes("admin") || roles.includes("moderator");

  const taxonomyQuery = useApiQuery<ForumTaxonomy>(
    queryKeys.admin.forumTaxonomy(),
    () => apiFetch<ForumTaxonomy>(`${BASE}/taxonomy`),
    EMPTY_TAXONOMY,
  );

  // Ключ включает фильтр и поиск → их смена сама триггерит запрос.
  const questionsQuery = useInfiniteApiQuery<ForumAdminQuestionItem>(
    token ? queryKeys.admin.forumQuestions(statusFilter, appliedSearch) : null,
    50,
    async ({ limit, offset }) => {
      const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (statusFilter) query.set("status", statusFilter);
      if (appliedSearch) query.set("q", appliedSearch);
      return apiFetch<{ items: ForumAdminQuestionItem[]; total: number; hasMore: boolean }>(
        `${BASE}/questions?${query}`,
      );
    },
  );

  const taxonomy = taxonomyQuery.data;
  const questions = questionsQuery.items;
  const state = combineState(taxonomyQuery.state, fromInfiniteState(questionsQuery.state));
  const reloadTaxonomy = taxonomyQuery.refetch;
  const reloadQuestions = questionsQuery.reload;

  const changeStatusFilter = useCallback((next: ForumQuestionStatus | "") => {
    setStatusFilter(next);
  }, []);

  const submitSearch = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setAppliedSearch(search.trim());
    },
    [search],
  );

  const resetSearch = useCallback(() => {
    setSearch("");
    setAppliedSearch("");
  }, []);

  const createValue = useCallback(
    async (axis: ForumAxis, label: string) => {
      if (!label.trim()) return;
      try {
        await apiFetch<ForumTaxonomyValue>(`${BASE}/${axis}`, { method: "POST", body: { label: label.trim() } });
        await reloadTaxonomy();
        setMessage("Значение добавлено.");
      } catch (error) {
        setMessage(errorText(error, "Не удалось добавить значение."));
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
        setMessage(errorText(error, "Не удалось переименовать значение."));
      }
    },
    [reloadTaxonomy],
  );

  // Перестановка значения справочника: меняем position местами с соседом.
  const reorderValue = useCallback(
    async (axis: ForumAxis, id: string, direction: "up" | "down") => {
      const list = axis === "raw-materials" ? taxonomy.rawMaterials : taxonomy.questionTypes;
      const index = list.findIndex((value) => value.id === id);
      if (index === -1) return;
      const neighborIndex = direction === "up" ? index - 1 : index + 1;
      const current = list[index];
      const neighbor = list[neighborIndex];
      if (!current || !neighbor) return;
      try {
        await Promise.all([
          apiFetch(`${BASE}/${axis}/${id}`, {
            method: "PATCH",
            body: { label: current.label, position: neighbor.position },
          }),
          apiFetch(`${BASE}/${axis}/${neighbor.id}`, {
            method: "PATCH",
            body: { label: neighbor.label, position: current.position },
          }),
        ]);
        await reloadTaxonomy();
      } catch (error) {
        setMessage(errorText(error, "Не удалось изменить порядок."));
      }
    },
    [reloadTaxonomy, taxonomy],
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
        await Promise.all([reloadTaxonomy(), Promise.resolve(reloadQuestions())]);
        setMessage(`Значение удалено. Затронуто вопросов: ${result.affectedQuestions}.`);
      } catch (error) {
        setMessage(errorText(error, "Не удалось удалить значение."));
      }
    },
    [reloadQuestions, reloadTaxonomy],
  );

  const moderate = useCallback(
    async (action: "hide" | "restore" | "delete", id: string) => {
      if (action === "delete" && !window.confirm("Удалить вопрос вместе со всеми ответами?")) return;
      if (action === "hide" && !window.confirm("Скрыть вопрос из публичного форума?")) return;
      try {
        if (action === "delete") {
          await apiFetch(`${BASE}/questions/${id}`, { method: "DELETE" });
        } else {
          await apiFetch(`${BASE}/questions/${id}/${action}`, { method: "POST" });
        }
        reloadQuestions();
        setMessage(
          action === "delete" ? "Вопрос удалён." : action === "hide" ? "Вопрос скрыт." : "Вопрос восстановлен.",
        );
      } catch (error) {
        setMessage(errorText(error, "Не удалось выполнить действие."));
      }
    },
    [reloadQuestions],
  );

  const seedQuestion = useCallback(
    async (input: SeedInput) => {
      try {
        await apiFetch<{ id: string }>(`${BASE}/questions`, { method: "POST", body: input });
        reloadQuestions();
        setMessage("Вопрос засеян.");
        return true;
      } catch (error) {
        setMessage(errorText(error, "Не удалось засеять вопрос."));
        return false;
      }
    },
    [reloadQuestions],
  );

  const displayMessage = message ?? questionsQuery.errorMessage ?? taxonomyQuery.errorMessage;

  return useMemo(
    () => ({
      state,
      message: displayMessage,
      taxonomy,
      questions,
      questionsQuery,
      statusFilter,
      search,
      appliedSearch,
      canManageTaxonomy,
      canModerate,
      changeStatusFilter,
      submitSearch,
      resetSearch,
      setSearch,
      createValue,
      renameValue,
      reorderValue,
      deleteValue,
      moderate,
      seedQuestion,
      reloadQuestions,
      setMessage,
    }),
    [
      appliedSearch,
      canManageTaxonomy,
      canModerate,
      changeStatusFilter,
      createValue,
      deleteValue,
      displayMessage,
      moderate,
      questions,
      questionsQuery,
      reloadQuestions,
      renameValue,
      reorderValue,
      resetSearch,
      search,
      seedQuestion,
      state,
      statusFilter,
      submitSearch,
      taxonomy,
    ],
  );
}
