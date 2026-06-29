// Типизированные ручки CMS-форума (/admin/content/forum): справочники (две оси),
// вопросы и ответы с быстрой модерацией и засевом. Типы — из shared.
//
// Примечание: CMS-редакторы дерева (обучение, индексы, база знаний, документация)
// сюда НЕ входят намеренно — их модели данных содержат редакторские Block[]
// (lib/editor) и не являются чистыми API-DTO, поэтому остаются на локальном
// data-слое вьюх (generic mutate), а не в shared-клиенте.
import type {
  ForumAdminQuestionDetail,
  ForumAdminQuestionItem,
  ForumTaxonomy,
  ForumTaxonomyValue,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch } from "./requests";
import { enc, type PaginationInput } from "./endpoint-utils";

const FORUM_BASE = "/admin/content/forum";
type ForumAxis = "raw-materials" | "question-types";

function forumQuestionsSuffix(pagination: PaginationInput, filters: { status?: string; q?: string }) {
  const query = new URLSearchParams();
  if (pagination.limit !== undefined) query.set("limit", String(pagination.limit));
  if (pagination.offset !== undefined) query.set("offset", String(pagination.offset));
  if (filters.status?.trim()) query.set("status", filters.status.trim());
  if (filters.q?.trim()) query.set("q", filters.q.trim());
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export const adminForumApi = {
  taxonomy: () => apiFetch<ForumTaxonomy>(`${FORUM_BASE}/taxonomy`),
  questions: (pagination: PaginationInput = {}, filters: { status?: string; q?: string } = {}) =>
    apiFetch<PaginatedResponse<ForumAdminQuestionItem>>(
      `${FORUM_BASE}/questions${forumQuestionsSuffix(pagination, filters)}`,
    ),
  question: (questionId: string) => apiFetch<ForumAdminQuestionDetail>(`${FORUM_BASE}/questions/${enc(questionId)}`),
  createTaxonomyValue: (axis: ForumAxis, label: string) =>
    apiFetch<ForumTaxonomyValue>(`${FORUM_BASE}/${axis}`, { method: "POST", body: { label } }),
  updateTaxonomyValue: (axis: ForumAxis, id: string, body: { label: string; position?: number }) =>
    apiFetch<unknown>(`${FORUM_BASE}/${axis}/${enc(id)}`, { method: "PATCH", body }),
  deleteTaxonomyValue: (axis: ForumAxis, id: string) =>
    apiFetch<{ ok: true; affectedQuestions: number }>(`${FORUM_BASE}/${axis}/${enc(id)}`, { method: "DELETE" }),
  deleteQuestion: (questionId: string) =>
    apiFetch<unknown>(`${FORUM_BASE}/questions/${enc(questionId)}`, { method: "DELETE" }),
  moderateQuestion: (questionId: string, action: "hide" | "restore") =>
    apiFetch<unknown>(`${FORUM_BASE}/questions/${enc(questionId)}/${action}`, { method: "POST" }),
  seedQuestion: (input: { title: string; body: string; rawMaterialId: string; questionTypeId: string }) =>
    apiFetch<{ id: string }>(`${FORUM_BASE}/questions`, { method: "POST", body: input }),
  deleteAnswer: (answerId: string) => apiFetch<unknown>(`${FORUM_BASE}/answers/${enc(answerId)}`, { method: "DELETE" }),
  moderateAnswer: (answerId: string, action: "hide" | "restore") =>
    apiFetch<unknown>(`${FORUM_BASE}/answers/${enc(answerId)}/${action}`, { method: "POST" }),
  seedAnswer: (questionId: string, body: string) =>
    apiFetch<unknown>(`${FORUM_BASE}/questions/${enc(questionId)}/answers`, { method: "POST", body: { body } }),
};
