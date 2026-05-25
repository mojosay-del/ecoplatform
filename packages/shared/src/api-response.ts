// Типы ОТВЕТОВ публичного API. Расширение dto.ts (там — входные zod-схемы).
// Замена `any[]` в apps/web/src/views — компилятор ловит опечатки в полях
// и автодополнение в IDE начинает работать.
//
// Поля сознательно укладываются под фактическую выдачу сервисов
// (apps/api/src/content/services/*), а НЕ под чистую Prisma-модель —
// в API некоторые поля приходят с decorator-обёрткой (likedByMe, hasAccess,
// progress и т.п.). Дата приходит строкой (JSON.stringify Date → string).

import type {
  CompanyStatus,
  CompanyType,
  ConsentSource,
  LegalDocumentType,
  PlatformRole,
  SubscriptionPlan,
  UserGender,
  UserStatus,
} from "./domain";
import type { PriceIndexSummary } from "./price-index";

// ── Common ────────────────────────────────────────────────────────────────
export type IsoDateString = string;

// Стандартный envelope пагинации. Используется на всех публичных списочных
// эндпоинтах (`/news`, `/admin/content/news`, `/notifications`, тикеты, ...).
// `hasMore` фронт использует для infinite-scroll: если true — догружает
// `offset += limit`.
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  hasMore: boolean;
};

export type PaginationQuery = {
  limit?: number;
  offset?: number;
};

export type CommentLikeCount = {
  likes: number;
};

// ── News ──────────────────────────────────────────────────────────────────
export type NewsTag = {
  id: string;
  name: string;
  slug: string;
};

export type NewsTagLink = {
  newsTag: NewsTag;
};

export type NewsListItem = {
  id: string;
  slug: string;
  title: string;
  lead: string;
  coverImageId: string | null;
  firstPublishedAt: IsoDateString | null;
  status: string;
  tags: NewsTagLink[];
  likedByMe: boolean;
  _count: {
    likes: number;
    comments: number;
  };
};

export type NewsCommentAuthorPublic = {
  id: string;
  firstName: string;
  lastName: string;
  gender: string;
  avatarUrl: string | null;
};

export type NewsCommentDecorated = {
  id: string;
  text: string;
  createdAt: IsoDateString;
  status: string;
  parentCommentId: string | null;
  user: NewsCommentAuthorPublic;
  likedByMe: boolean;
  _count: CommentLikeCount;
  replies?: NewsCommentDecorated[];
};

export type NewsContentBlock = {
  id: string;
  position: number;
  type: string;
  payload: Record<string, unknown>;
};

export type NewsPostDetail = NewsListItem & {
  blocks: NewsContentBlock[];
  comments: NewsCommentDecorated[];
};

// ── Indices ───────────────────────────────────────────────────────────────
export type PriceChartPoint = {
  date: IsoDateString;
  price: number;
};

export type IndexPeriodKey = "2W" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "3Y";

export type PriceIndexChart = Partial<Record<IndexPeriodKey, PriceChartPoint[]>>;

export type NomenclatureListItem = {
  id: string;
  name: string;
  code: string;
  unit: string | null;
  priceIndex: {
    id: string;
    status: string;
  } | null;
  summary: PriceIndexSummary;
  chart: PriceIndexChart;
};

export type NomenclatureCategoryListItem = {
  id: string;
  slug: string;
  name: string;
  position: number;
  isActive: boolean;
  nomenclatures: NomenclatureListItem[];
};

// ── Learning ──────────────────────────────────────────────────────────────
export type LearningLessonSummary = {
  id: string;
  title: string;
  position: number;
  status: string;
};

export type LearningChapterSummary = {
  id: string;
  title: string;
  position: number;
  lessons: LearningLessonSummary[];
};

export type LearningModuleListItem = {
  id: string;
  title: string;
  summary: string | null;
  description: string | null;
  coverImageId: string | null;
  accessLevel: string;
  oneTimePrice: number | null;
  isInDevelopment: boolean;
  position: number;
  status: string;
  hasAccess: boolean;
  chapters: LearningChapterSummary[];
};

export type LessonAttachment = {
  id: string;
  fileId: string;
  displayName: string;
  position: number;
};

export type LessonBlock = {
  id: string;
  position: number;
  type: string;
  payload: Record<string, unknown>;
};

export type LessonDetail = LearningLessonSummary & {
  blocks?: LessonBlock[];
  attachments?: LessonAttachment[];
  completedAt?: IsoDateString | null;
};

export type LearningChapterDetail = Omit<LearningChapterSummary, "lessons"> & {
  lessons: LessonDetail[];
};

export type LearningModulePreview = {
  promotionalDescription: string | null;
  whatYouWillLearn: string[];
};

export type LearningModuleProgress = {
  completedLessons: number;
  totalLessons: number;
  percent: number;
};

export type LearningModuleDetail = LearningModuleListItem & {
  preview: LearningModulePreview | null;
  chapters: LearningChapterDetail[];
  progress: LearningModuleProgress | null;
};

// ── Knowledge Base ────────────────────────────────────────────────────────
export type KnowledgeNode = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  iconType: string | null;
  coverImageId: string | null;
  parentId: string | null;
  position: number;
  status: string;
  // У tree-выдачи children приходят как nested-массив, у detail-выдачи —
  // как массив того же типа KnowledgeNode (без блоков, только метаданные).
  // `blocks` приходит только в KnowledgeArticleDetail, поэтому опционально.
  children?: KnowledgeNode[];
  blocks?: Array<{
    id: string;
    position: number;
    type: string;
    payload: Record<string, unknown>;
  }>;
};

export type KnowledgeBreadcrumb = {
  id: string;
  slug: string;
  title: string;
};

export type KnowledgeArticleDetail = KnowledgeNode & {
  description: string | null;
  blocks: Array<{
    id: string;
    position: number;
    type: string;
    payload: Record<string, unknown>;
  }>;
  breadcrumbs: KnowledgeBreadcrumb[];
};

// ── Account / billing / notifications ─────────────────────────────────────
export type BillingSubscription = {
  id: string;
  companyId: string;
  plan: string;
  status: string;
  startsAt: IsoDateString;
  endsAt: IsoDateString;
  reason: string | null;
  createdAt: IsoDateString;
};

// `/billing/status` отдаёт полный Company (с реквизитами) + список подписок.
// Не вырезаем поля, потому что AccountView отображает и реквизиты, и историю.
export type BillingStatus = {
  id: string;
  organizationName: string;
  type: string;
  status: string;
  subscriptionPlan: string | null;
  subscriptionEndsAt: IsoDateString | null;
  demoEndsAt: IsoDateString | null;
  billingInn: string | null;
  billingKpp: string | null;
  legalAddress: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  correspondentAccount: string | null;
  subscriptions: BillingSubscription[];
};

export type AuthMeUser = {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  gender: UserGender;
  status: UserStatus;
  avatarUrl: string | null;
  companyId: string | null;
  company: AuthMeCompany | null;
  platformRoles: PlatformRole[];
  requiresReConsent: boolean;
};

export type AuthMeCompany = {
  id: string;
  organizationName: string;
  type: CompanyType;
  status: CompanyStatus;
  demoEndsAt: IsoDateString | null;
  subscriptionPlan: SubscriptionPlan | null;
  subscriptionEndsAt: IsoDateString | null;
};

// ── Legal documents & consents ────────────────────────────────────────────
// Публичная карточка юр-документа: id текущей активной версии, заголовок,
// summary краткого описания изменений, рендеримый HTML и флаг обязательности.
// `body` отдаётся уже после серверной санитизации (DOMPurify в shared),
// фронт ещё раз прогоняет через тот же sanitize-html — двойная защита.
export type LegalDocumentSummary = {
  id: string;
  type: LegalDocumentType;
  version: string;
  title: string;
  summary: string | null;
  isRequired: boolean;
  publishedAt: IsoDateString | null;
};

export type LegalDocumentDetail = LegalDocumentSummary & {
  body: string;
  isActive: boolean;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type ConsentRecordItem = {
  id: string;
  documentId: string;
  acceptedAt: IsoDateString;
  source: ConsentSource;
  document: LegalDocumentSummary;
};

// Снимок «надо ли пользователю переподтвердить условия» — используется в
// /auth/me, чтобы web показал модалку re-consent при возврате после
// публикации новой версии обязательного документа.
export type PendingConsentInfo = {
  requiresReConsent: boolean;
  documents: LegalDocumentSummary[];
};
