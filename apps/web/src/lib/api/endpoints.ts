// Типизированный namespaced API-клиент. Каждый endpoint:
//  1) Строит URL внутри (никаких хардкод-строк по 42 файлам),
//  2) Привязан к response-DTO из @ecoplatform/shared,
//  3) Использует низкоуровневый apiFetch с auto-refresh и rate-limit retry.
//
// Использование: `api.news.list()` вместо `apiFetch<NewsListItem[]>("/news")`.
// При ребрендинге URL (например, `/news` → `/v2/news`) меняется одна строка
// в доменном endpoint-модуле, а не 42 в views.

import { adminApi } from "./admin-endpoints";
import { documentationApi, indicesApi, knowledgeBaseApi, learningApi, newsApi } from "./content-endpoints";
import { forumApi } from "./forum-endpoints";
import { marketplaceApi } from "./marketplace-endpoints";
import {
  accountApi,
  authApi,
  billingApi,
  filesApi,
  legalApi,
  moderationApi,
  notificationsApi,
  supportApi,
  tripCalculatorApi,
} from "./user-endpoints";

export type { LikeResult } from "./endpoint-utils";
export type { AccountDeletionStatus, NotificationItem } from "./user-endpoints";

export const api = {
  news: newsApi,
  account: accountApi,
  indices: indicesApi,
  marketplace: marketplaceApi,
  learning: learningApi,
  knowledgeBase: knowledgeBaseApi,
  documentation: documentationApi,
  forum: forumApi,
  tripCalculator: tripCalculatorApi,
  billing: billingApi,
  auth: authApi,
  notifications: notificationsApi,
  support: supportApi,
  admin: adminApi,
  moderation: moderationApi,
  files: filesApi,
  legal: legalApi,
};

export type ApiClient = typeof api;
