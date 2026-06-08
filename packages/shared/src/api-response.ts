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
  ContentStatus,
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

export type NewsTagSummary = NewsTag & {
  usageCount: number;
};

export type NewsTagLink = {
  newsTag: NewsTag;
};

export type NewsAudioAttachment = {
  fileId: string;
  episodeTitle: string | null;
  caption: string | null;
  durationSeconds: number | null;
};

export type NewsListItem = {
  id: string;
  slug: string;
  title: string;
  lead: string;
  coverImageId: string | null;
  audioAttachment: NewsAudioAttachment | null;
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
  position: number;
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
  coverImageId: string | null;
  coverSubtitle: string | null;
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
  // Заполняются сервером только когда у пользователя есть доступ к уроку.
  // downloadUrl приватных вложений — короткоживущая presigned-ссылка; null,
  // если файл недоступен. originalName/mimeType — для иконки и подписи.
  downloadUrl?: string | null;
  originalName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
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
  updatedAt: IsoDateString;
};

export type BillingCompanySummary = {
  id: string;
  organizationName: string;
  type: string;
  status: string;
  demoEndsAt: IsoDateString | null;
  subscriptionPlan: string | null;
  subscriptionEndsAt: IsoDateString | null;
  billingInn: string | null;
  billingKpp: string | null;
  legalAddress: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  correspondentAccount: string | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
};

export type BillingSubscriptionActivationResponse = {
  company: BillingCompanySummary;
  subscription: BillingSubscription;
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
  // Старая «одна строка» — для обратной совместимости с UI до Волны 7.4.
  legalAddress: string | null;
  bankName: string | null;
  bankBik: string | null;
  bankAccount: string | null;
  correspondentAccount: string | null;
  // Контакты компании (Волна 7.3).
  websiteUrl: string | null;
  corporatePhone: string | null;
  corporateEmail: string | null;
  about: string | null;
  logoFileId: string | null;
  contactPersonName: string | null;
  contactPersonPhone: string | null;
  contactPersonEmail: string | null;
  // Структурированные адреса (Волна 7.2). Опциональные; для большинства
  // компаний пока пусто.
  factualAddress: CompanyAddress | null;
  structuredLegalAddress: CompanyAddress | null;
  subscriptions: BillingSubscription[];
};

// Развёрнутый адрес как часть Company-снапшота в /billing/status.
// Прайма Decimal сериализуется в строку — храним latitude/longitude как строку
// чтобы не терять точность при JSON round-trip.
export type CompanyAddress = {
  id: string;
  country: string;
  region: string | null;
  city: string;
  street: string | null;
  building: string | null;
  apartment: string | null;
  postcode: string | null;
  latitude: string | null;
  longitude: string | null;
  formatted: string;
  source: string;
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
  deletionRequestedAt: IsoDateString | null;
  deletionScheduledFor: IsoDateString | null;
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

// Запись журнала админ-действий. Единый формат payload для change-событий:
// { before, after, diff } + произвольные доп. поля (reasonCode, sanctionId и т.п.).
// Legacy-записи могут не иметь before/after — UI это учитывает.
export type AdminJournalDiffEntry = {
  before: unknown;
  after: unknown;
};

export type AdminJournalPayload = {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  diff?: Record<string, AdminJournalDiffEntry>;
  [key: string]: unknown;
};

export type AdminJournalActor = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export type AdminJournalEntitySummary = {
  type: string;
  typeLabel: string;
  title: string;
  subtitle?: string | null;
};

export type AdminJournalEntry = {
  id: string;
  actorId: string;
  actor: AdminJournalActor | null;
  action: string;
  entityType: string;
  entityId: string;
  entity: AdminJournalEntitySummary | null;
  comment: string | null;
  payload: AdminJournalPayload | null;
  createdAt: IsoDateString;
};

export type AdminHealthStatus = "ok" | "down" | "disabled";

export type AdminDashboardSummary = {
  generatedAt: IsoDateString;
  kpis: {
    activeUsersToday: number;
    registrationsToday: number;
    activeSubscriptions: number;
    subscriptionsExpiringSoon: number;
    openModerationCases: number;
    activeSupportTickets: number;
  };
  // Значения за предыдущий сопоставимый период (к тому же моменту вчера / 24 ч
  // назад) для метрик, где сравнение корректно. Фронт показывает дельту-чип.
  kpiTrends: {
    activeUsersToday: number;
    registrationsToday: number;
    activeSubscriptions: number;
  };
  business: {
    conversion: {
      convertedCompanies: number;
      totalCompanies: number;
      percent: number;
    };
    subscriptionsByPlan: {
      basic: number;
      extended: number;
    };
    newSubscriptionsThisMonth: number;
    companiesByStatus: Array<{ status: string; count: number }>;
  };
  operations: {
    pendingDeletionRequests: number;
    pastDueCompanies: number;
    lockedAccounts: number;
  };
  systemHealth: {
    database: AdminHealthStatus;
    redis: AdminHealthStatus;
    storage: AdminHealthStatus;
  };
  registrationSeries: Array<{
    date: IsoDateString;
    count: number;
  }>;
  recentAuditEvents: Array<{
    id: string;
    action: string;
    actor: AdminJournalActor | null;
    entityType: string;
    entityLabel: string;
    comment: string | null;
    createdAt: IsoDateString;
  }>;
};

// Лёгкая сводка для не-админ-персонала (контент-менеджер, модератор). Секции
// присутствуют только под роли запросившего: content — для контент-менеджера,
// moderation — для модератора; админ получает обе.
export type AdminStaffSummary = {
  generatedAt: IsoDateString;
  content: {
    newsDrafts: number;
    lessonDrafts: number;
    knowledgeDrafts: number;
  } | null;
  moderation: {
    openCases: number;
  } | null;
};

// ── Moderation ────────────────────────────────────────────────────────────
export type ModerationCaseType = "complaint" | "suspicious_activity";

export type ModerationCaseStatus = "open" | "in_review" | "resolved" | "escalated" | "closed_by_admin";

export type ComplaintStatus = "pending" | "resolved" | "auto_closed";

export type ModerationDecisionType = "leave_as_is" | "remove_content" | "warn_company" | "escalate_to_admin";

export type SanctionType = "warning" | "content_removal" | "module_restriction" | "user_block" | "company_block";

export type ModeratedEntityType = "news_comment" | "news_post" | "knowledge_article";

export type ModerationCommentStatus = "published" | "hidden_by_moderator" | "removed_by_admin" | "removed_with_news";

export type ModerationUserSummary = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: { id: string; organizationName: string } | null;
};

export type ModerationEntitySummary =
  | {
      type: "news_comment";
      id: string;
      text: string;
      status: ModerationCommentStatus;
      createdAt: IsoDateString;
      newsPost: { id: string; title: string; slug: string };
      author: ModerationUserSummary | null;
    }
  | { type: "news_post"; id: string; title: string; slug: string; status: ContentStatus }
  | { type: "knowledge_article"; id: string; title: string; slug: string; status: ContentStatus };

export type ModerationComplaint = {
  id: string;
  caseId: string;
  entityType: ModeratedEntityType;
  entityId: string;
  authorId: string;
  authorCompanyId: string | null;
  reasonCode: string;
  comment: string | null;
  status: ComplaintStatus;
  createdAt: IsoDateString;
  author: ModerationUserSummary | null;
};

export type ModerationDecision = {
  id: string;
  caseId: string;
  actorId: string;
  actorRole: string;
  type: ModerationDecisionType;
  reasonCode: string;
  comment: string | null;
  createdAt: IsoDateString;
  actor: ModerationUserSummary | null;
};

export type ModerationSanction = {
  id: string;
  caseId: string;
  decisionId: string | null;
  type: SanctionType;
  targetType: string;
  targetId: string;
  parameters: unknown;
  appliedById: string;
  appliedAt: IsoDateString;
  liftedAt: IsoDateString | null;
  liftedById: string | null;
};

export type ModerationCaseListItem = {
  id: string;
  type: ModerationCaseType;
  entityType: ModeratedEntityType;
  entityId: string;
  entityAuthorId: string | null;
  entityCompanyId: string | null;
  status: ModerationCaseStatus;
  lockedById: string | null;
  lockedUntil: IsoDateString | null;
  createdAt: IsoDateString;
  updatedAt: IsoDateString;
  closedAt: IsoDateString | null;
  complaints: ModerationComplaint[];
  decisions: ModerationDecision[];
  sanctions: ModerationSanction[];
  lockedBy: ModerationUserSummary | null;
  entity: ModerationEntitySummary | null;
};

export type ModerationCaseDetail = ModerationCaseListItem;
