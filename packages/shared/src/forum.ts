// Типы ответов публичного API раздела «Форум» (Q&A сообщества).
// Дополняет api-response.ts; держим отдельным файлом, т.к. форум — самостоятельный
// модуль (apps/api/src/forum), а не часть content-сервисов.
//
// Суть раздела: searchable «память отрасли» — вопрос → ответы → принятое решение.
// Навигация = поиск + две оси-справочника (Вид сырья, Тип вопроса), которые ведёт
// админ. Тело — простой текст. Репутация автора собирается из marketplace
// (рейтинг + сделки) и собственной метрики форума, здесь не дублируется.

import type { CompanyType } from "./domain";
import type { IsoDateString } from "./api-response";

// Значение оси-справочника. Обе оси редактируются админом из CMS.
export type ForumTaxonomyValue = {
  id: string;
  label: string;
  position: number;
};

// Оба справочника одним ответом — для фильтров ленты и формы нового вопроса.
export type ForumTaxonomy = {
  rawMaterials: ForumTaxonomyValue[];
  questionTypes: ForumTaxonomyValue[];
};

export type ForumQuestionStatus = "open" | "answered" | "solved" | "hidden";

// Репутация автора (у вопроса и у ответа). Источники: тип компании = роль;
// рейтинг и сделки — marketplace; «решено на форуме» — метрика самого форума.
export type ForumAuthorReputation = {
  userId: string;
  // Отображаемое имя «Имя Ф.» — без раскрытия полного профиля.
  name: string;
  avatarUrl: string | null;
  // Роль автора = тип его компании (заготовитель/трейдер/переработчик); null у стаффа.
  companyType: CompanyType | null;
  companyName: string | null;
  // «Проверенный» — компания с активной подпиской/верифицирована.
  verified: boolean;
  // Общий рейтинг компании на площадке (null = ещё нет отзывов).
  rating: number | null;
  // Число состоявшихся сделок компании (Offer.dealResult=agreed).
  dealsCompleted: number;
  // Сколько вопросов решено ответами этого автора именно на форуме.
  forumSolved: number;
};

export type ForumWeeklyExpert = {
  author: ForumAuthorReputation;
  solvedAnswersCount: number;
};

export type ForumSummary = {
  solvedQuestionsCount: number;
  currentUser: {
    answersCount: number;
    solvedAnswersCount: number;
  };
  weeklyExperts: ForumWeeklyExpert[];
};

export type ForumQuestionViewRecord = {
  views: number;
};

export type ForumSearchSnippet = {
  source: "title" | "question" | "answer";
  text: string;
  highlights: Array<{ start: number; end: number }>;
};

// Карточка вопроса в ленте.
export type ForumQuestionListItem = {
  id: string;
  title: string;
  // Обрезанное превью тела (для вопросов без принятого ответа).
  excerpt: string;
  status: ForumQuestionStatus;
  rawMaterial: ForumTaxonomyValue | null;
  questionType: ForumTaxonomyValue | null;
  answersCount: number;
  views: number;
  // Голоса «полезно» по принятому (или топ-) ответу — для меты карточки.
  topVotes: number;
  // Превью принятого ответа (только у solved-вопросов).
  acceptedAnswerExcerpt: string | null;
  // Контекст найденного совпадения: обычный текст + диапазоны для подсветки.
  searchSnippet?: ForumSearchSnippet;
  author: ForumAuthorReputation;
  createdAt: IsoDateString;
};

// Закреплённая в форуме новость («якорь») — показывается сверху ленты.
export type ForumPinnedNews = {
  id: string;
  slug: string;
  title: string;
  lead: string;
  // Есть ли у новости подкаст (аудио-вложение) — отметка в карточке.
  hasPodcast: boolean;
  firstPublishedAt: IsoDateString | null;
};

// Реплика в ветке под ответом. Это обсуждение ответа, а не самостоятельный ответ
// на вопрос: у неё нет голосования и выбора «лучшим».
export type ForumAnswerReplyItem = {
  id: string;
  body: string;
  // Может ли текущий пользователь править/удалять (автор ответа или модератор/админ).
  canManage: boolean;
  author: ForumAuthorReputation;
  createdAt: IsoDateString;
};

// Ответ в карточке вопроса.
export type ForumAnswerItem = ForumAnswerReplyItem & {
  votesCount: number;
  isAccepted: boolean;
  // Проголосовал ли текущий пользователь «полезно» за этот ответ.
  votedByMe: boolean;
  replies: ForumAnswerReplyItem[];
};

// Полная карточка вопроса.
export type ForumQuestionDetail = {
  id: string;
  title: string;
  body: string;
  status: ForumQuestionStatus;
  rawMaterial: ForumTaxonomyValue | null;
  questionType: ForumTaxonomyValue | null;
  views: number;
  answersCount: number;
  acceptedAnswerId: string | null;
  author: ForumAuthorReputation;
  createdAt: IsoDateString;
  // Контекст текущего пользователя.
  isAuthor: boolean; // автор вопроса — может отметить решение
  canManage: boolean; // автор или модератор/админ — может править/удалять вопрос
  subscribed: boolean; // подписан на уведомления о новых ответах
  answers: ForumAnswerItem[];
};

// ── Админка форума ──────────────────────────────────────────────────────────
// Карточка вопроса в админском списке (модерация/засев).
export type ForumAdminQuestionItem = {
  id: string;
  title: string;
  status: ForumQuestionStatus;
  rawMaterial: ForumTaxonomyValue | null;
  questionType: ForumTaxonomyValue | null;
  answersCount: number;
  views: number;
  authorName: string;
  createdAt: IsoDateString;
};
