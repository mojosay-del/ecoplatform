import type {
  ForumPinnedNews,
  ForumQuestionDetail,
  ForumQuestionListItem,
  ForumQuestionViewRecord,
  ForumSummary,
  ForumTaxonomy,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch } from "./requests";
import { enc } from "./endpoint-utils";

export type ForumSort = "newest" | "unanswered" | "popular";

export type ForumListInput = {
  q?: string;
  rawMaterialId?: string | null;
  questionTypeId?: string | null;
  sort?: ForumSort;
  limit?: number;
  offset?: number;
};

function forumListSuffix(input: ForumListInput = {}): string {
  const query = new URLSearchParams();
  if (input.q) query.set("q", input.q);
  if (input.rawMaterialId) query.set("rawMaterialId", input.rawMaterialId);
  if (input.questionTypeId) query.set("questionTypeId", input.questionTypeId);
  if (input.sort) query.set("sort", input.sort);
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  return query.toString() ? `?${query.toString()}` : "";
}

export type ForumQuestionInput = {
  title: string;
  body: string;
  rawMaterialId: string;
  questionTypeId: string;
};

export const forumApi = {
  questions: (input: ForumListInput = {}) =>
    apiFetch<PaginatedResponse<ForumQuestionListItem>>(`/forum${forumListSuffix(input)}`),
  question: (id: string) => apiFetch<ForumQuestionDetail>(`/forum/q/${enc(id)}`),
  recordView: (id: string) => apiFetch<ForumQuestionViewRecord>(`/forum/q/${enc(id)}/view`, { method: "POST" }),
  taxonomy: () => apiFetch<ForumTaxonomy>("/forum/taxonomy"),
  pinnedNews: () => apiFetch<ForumPinnedNews[]>("/forum/pinned-news"),
  summary: () => apiFetch<ForumSummary>("/forum/summary"),

  ask: (body: ForumQuestionInput) => apiFetch<{ id: string }>("/forum/q", { method: "POST", body }),
  updateQuestion: (id: string, body: Partial<ForumQuestionInput>) =>
    apiFetch<{ id: string }>(`/forum/q/${enc(id)}`, { method: "PATCH", body }),
  deleteQuestion: (id: string) => apiFetch<{ ok: true }>(`/forum/q/${enc(id)}`, { method: "DELETE" }),

  answer: (questionId: string, body: { body: string }) =>
    apiFetch<{ id: string }>(`/forum/q/${enc(questionId)}/answers`, { method: "POST", body }),
  updateAnswer: (answerId: string, body: { body: string }) =>
    apiFetch<{ id: string }>(`/forum/answers/${enc(answerId)}`, { method: "PATCH", body }),
  deleteAnswer: (answerId: string) => apiFetch<{ ok: true }>(`/forum/answers/${enc(answerId)}`, { method: "DELETE" }),

  vote: (answerId: string) =>
    apiFetch<{ voted: boolean; votesCount: number }>(`/forum/answers/${enc(answerId)}/vote`, { method: "POST" }),
  accept: (questionId: string, answerId: string) =>
    apiFetch<{ ok: true }>(`/forum/q/${enc(questionId)}/accept`, { method: "POST", body: { answerId } }),

  subscribe: (questionId: string) =>
    apiFetch<{ subscribed: boolean }>(`/forum/q/${enc(questionId)}/subscribe`, { method: "POST" }),
  unsubscribe: (questionId: string) =>
    apiFetch<{ subscribed: boolean }>(`/forum/q/${enc(questionId)}/subscribe`, { method: "DELETE" }),
};
