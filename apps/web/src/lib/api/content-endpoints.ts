import type {
  DocumentationDetail,
  DocumentationDownload,
  DocumentationNode,
  KnowledgeArticleDetail,
  KnowledgeNode,
  LearningModuleDetail,
  LearningModuleListItem,
  NewsListItem,
  NewsPostDetail,
  NewsTagSummary,
  NomenclatureCategoryListItem,
  PaginatedResponse,
} from "@ecoplatform/shared";
import { apiFetch } from "./requests";
import {
  enc,
  paginationSuffix,
  previewSuffix,
  type ApiRequestOptions,
  type LikeResult,
  type PaginationInput,
  type PreviewRequestOptions,
} from "./endpoint-utils";

type NewsListInput = PaginationInput & { tags?: string[] };

function newsListSuffix(input: NewsListInput = {}) {
  const query = new URLSearchParams();
  if (input.limit !== undefined) query.set("limit", String(input.limit));
  if (input.offset !== undefined) query.set("offset", String(input.offset));
  input.tags?.forEach((tag) => query.append("tags[]", tag));
  return query.toString() ? `?${query.toString()}` : "";
}

export const newsApi = {
  list: (input: NewsListInput = {}, options: ApiRequestOptions = {}) =>
    apiFetch<PaginatedResponse<NewsListItem>>(`/news${newsListSuffix(input)}`, { token: options.token }),
  tags: (options: { limit?: number } = {}, requestOptions: ApiRequestOptions = {}) =>
    apiFetch<NewsTagSummary[]>(`/news/tags${options.limit !== undefined ? `?limit=${options.limit}` : ""}`, {
      token: requestOptions.token,
    }),
  get: (slug: string, options: PreviewRequestOptions = {}) =>
    apiFetch<NewsPostDetail>(`/news/${enc(slug)}${previewSuffix(options)}`, { token: options.token }),
  like: (id: string) => apiFetch<LikeResult>(`/news/${enc(id)}/like`, { method: "POST" }),
  addComment: (postId: string, body: { text: string; parentCommentId?: string }) =>
    apiFetch<{ id: string }>(`/news/${enc(postId)}/comments`, { method: "POST", body }),
  likeComment: (commentId: string) => apiFetch<LikeResult>(`/news/comments/${enc(commentId)}/like`, { method: "POST" }),
};

export const indicesApi = {
  list: (pagination: PaginationInput = {}) =>
    apiFetch<PaginatedResponse<NomenclatureCategoryListItem>>(`/indices${paginationSuffix(pagination)}`),
};

export const learningApi = {
  listModules: (pagination: PaginationInput = {}) =>
    apiFetch<PaginatedResponse<LearningModuleListItem>>(`/education/modules${paginationSuffix(pagination)}`),
  getModule: (id: string, options: PreviewRequestOptions = {}) =>
    apiFetch<LearningModuleDetail>(`/education/modules/${enc(id)}${previewSuffix(options)}`, {
      token: options.token,
    }),
  completeLesson: (lessonId: string) =>
    apiFetch<{ ok: true }>(`/education/lessons/${enc(lessonId)}/complete`, { method: "POST" }),
};

export const knowledgeBaseApi = {
  tree: () => apiFetch<KnowledgeNode[]>("/knowledge-base"),
  getArticle: (slug: string) => apiFetch<KnowledgeArticleDetail>(`/knowledge-base/${enc(slug)}`),
};

export const documentationApi = {
  tree: () => apiFetch<DocumentationNode[]>("/documentation"),
  pinned: () => apiFetch<DocumentationNode[]>("/documentation/pinned"),
  recent: (limit?: number) =>
    apiFetch<DocumentationNode[]>(`/documentation/recent${limit !== undefined ? `?limit=${limit}` : ""}`),
  search: (q: string) => apiFetch<DocumentationNode[]>(`/documentation/search?q=${enc(q)}`),
  getDocument: (slug: string) => apiFetch<DocumentationDetail>(`/documentation/${enc(slug)}`),
  // Свежая presigned-ссылка для скачивания прикреплённого файла.
  download: (id: string) => apiFetch<DocumentationDownload>(`/documentation/${enc(id)}/download`),
};
