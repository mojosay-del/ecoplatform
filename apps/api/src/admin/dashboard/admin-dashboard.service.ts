import { Injectable } from "@nestjs/common";
import {
  CompanyStatus,
  ContentStatus,
  ModerationCaseStatus,
  SubscriptionPlan,
  SubscriptionStatus,
  SupportTicketStatus,
} from "@prisma/client";
import type { AdminDashboardSummary, AdminHealthStatus, AdminStaffSummary, PlatformRole } from "@ecoplatform/shared";
import { HealthDependencyIndicator } from "../../health/health-dependency.indicator";
import { PrismaService } from "../../prisma/prisma.service";

type RegistrationRow = {
  day: Date | string;
  count: number | bigint;
};

type HealthCheckDetails = Record<string, { configured?: boolean; required?: boolean; status?: string }>;

const DAY_MS = 24 * 60 * 60 * 1000;

const ACTIVE_MODERATION_STATUSES = [
  ModerationCaseStatus.open,
  ModerationCaseStatus.in_review,
  ModerationCaseStatus.escalated,
];

const ACTIVE_SUPPORT_STATUSES = [
  SupportTicketStatus.new,
  SupportTicketStatus.in_progress,
  SupportTicketStatus.awaiting_user,
];

const ENTITY_TYPE_LABELS: Record<string, string> = {
  Chapter: "Глава курса",
  Company: "Компания",
  KnowledgeBaseArticle: "Статья базы знаний",
  LearningModule: "Курс",
  LegalDocument: "Юридический документ",
  Lesson: "Урок",
  ModerationCase: "Кейс модерации",
  NewsPost: "Новость",
  Nomenclature: "Номенклатура",
  NomenclatureCategory: "Категория номенклатуры",
  PlatformSetting: "Настройка платформы",
  PriceIndex: "Индекс цен",
  PriceIndexValue: "Значение индекса",
  Sanction: "Санкция",
  User: "Пользователь",
};

@Injectable()
export class AdminDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthDependencyIndicator,
  ) {}

  async getSummary(): Promise<AdminDashboardSummary> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const chartStart = addDays(todayStart, -29);
    const expiringCutoff = addDays(now, 7);
    // Для дельт сравниваем с тем же моментом вчера: «сегодня к этому часу» против
    // «вчера к этому же часу» — честно даже в середине дня. Подписки — состояние
    // 24 ч назад.
    const yesterdayStart = addDays(todayStart, -1);
    const yesterdayCutoff = new Date(yesterdayStart.getTime() + (now.getTime() - todayStart.getTime()));
    const dayAgo = new Date(now.getTime() - DAY_MS);

    const [
      activeSessionsToday,
      registrationsToday,
      activeSubscriptions,
      subscriptionsExpiringSoon,
      openModerationCases,
      activeSupportTickets,
      registrationRows,
      recentAuditEvents,
      business,
      operations,
      systemHealth,
      previousActiveSessions,
      previousRegistrations,
      previousActiveSubscriptions,
    ] = await Promise.all([
      this.prisma.session.findMany({
        where: {
          updatedAt: { gte: todayStart, lt: tomorrowStart },
          revokedAt: null,
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.active,
          startsAt: { lte: now },
          endsAt: { gt: now },
        },
      }),
      // Активные подписки, истекающие в ближайшие 7 дней — список «кому
      // продлевать»; именно этот KPI закрывает ручной биллинг.
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.active,
          startsAt: { lte: now },
          endsAt: { gt: now, lte: expiringCutoff },
        },
      }),
      this.prisma.moderationCase.count({
        where: { status: { in: ACTIVE_MODERATION_STATUSES } },
      }),
      this.prisma.supportTicket.count({
        where: { status: { in: ACTIVE_SUPPORT_STATUSES } },
      }),
      this.registrationSeries(chartStart, todayStart),
      this.recentAuditEvents(),
      this.businessSummary(now),
      this.operationsSummary(now),
      this.systemHealthSummary(),
      // Активные сессии вчера к этому же времени.
      this.prisma.session.findMany({
        where: {
          updatedAt: { gte: yesterdayStart, lt: yesterdayCutoff },
          revokedAt: null,
        },
        distinct: ["userId"],
        select: { userId: true },
      }),
      // Регистрации вчера к этому же времени.
      this.prisma.user.count({
        where: { createdAt: { gte: yesterdayStart, lt: yesterdayCutoff } },
      }),
      // Активные подписки по состоянию на 24 ч назад.
      this.prisma.subscription.count({
        where: {
          status: SubscriptionStatus.active,
          startsAt: { lte: dayAgo },
          endsAt: { gt: dayAgo },
        },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      kpis: {
        activeUsersToday: activeSessionsToday.length,
        registrationsToday,
        activeSubscriptions,
        subscriptionsExpiringSoon,
        openModerationCases,
        activeSupportTickets,
      },
      kpiTrends: {
        activeUsersToday: previousActiveSessions.length,
        registrationsToday: previousRegistrations,
        activeSubscriptions: previousActiveSubscriptions,
      },
      business,
      operations,
      systemHealth,
      registrationSeries: registrationRows,
      recentAuditEvents,
    };
  }

  // Роль-сводка для рабочего стола не-админ-персонала. Секции считаются только
  // под доступные роли, чтобы лишних запросов и данных не было.
  async getStaffSummary(roles: PlatformRole[]): Promise<AdminStaffSummary> {
    const isAdmin = roles.includes("admin");
    const canSeeContent = isAdmin || roles.includes("content_manager");
    const canSeeModeration = isAdmin || roles.includes("moderator");

    const [content, moderation] = await Promise.all([
      canSeeContent ? this.contentDraftsSummary() : Promise.resolve(null),
      canSeeModeration ? this.moderationQueueSummary() : Promise.resolve(null),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      content,
      moderation,
    };
  }

  private async contentDraftsSummary(): Promise<NonNullable<AdminStaffSummary["content"]>> {
    const [newsDrafts, lessonDrafts, knowledgeDrafts] = await Promise.all([
      this.prisma.newsPost.count({ where: { status: ContentStatus.draft } }),
      this.prisma.lesson.count({ where: { status: ContentStatus.draft } }),
      this.prisma.knowledgeBaseArticle.count({ where: { status: ContentStatus.draft } }),
    ]);

    return { newsDrafts, lessonDrafts, knowledgeDrafts };
  }

  private async moderationQueueSummary(): Promise<NonNullable<AdminStaffSummary["moderation"]>> {
    const openCases = await this.prisma.moderationCase.count({
      where: { status: { in: ACTIVE_MODERATION_STATUSES } },
    });

    return { openCases };
  }

  private async businessSummary(now: Date): Promise<AdminDashboardSummary["business"]> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCompanies, convertedCompanies, newSubscriptionsThisMonth, planGroups, statusGroups] = await Promise.all(
      [
        this.prisma.company.count(),
        // «Сконвертировались» = у компании есть хотя бы одна подписка (демо
        // подписку не создаёт, ручная активация — создаёт).
        this.prisma.company.count({ where: { subscriptions: { some: {} } } }),
        this.prisma.subscription.count({ where: { createdAt: { gte: monthStart } } }),
        this.prisma.subscription.groupBy({
          by: ["plan"],
          where: { status: SubscriptionStatus.active, startsAt: { lte: now }, endsAt: { gt: now } },
          _count: true,
        }),
        this.prisma.company.groupBy({ by: ["status"], _count: true }),
      ],
    );

    const planCount = (plan: SubscriptionPlan) => planGroups.find((group) => group.plan === plan)?._count ?? 0;

    return {
      conversion: {
        convertedCompanies,
        totalCompanies,
        percent: totalCompanies > 0 ? Math.round((convertedCompanies / totalCompanies) * 100) : 0,
      },
      subscriptionsByPlan: {
        basic: planCount(SubscriptionPlan.basic),
        extended: planCount(SubscriptionPlan.extended),
      },
      newSubscriptionsThisMonth,
      companiesByStatus: statusGroups
        .map((group) => ({ status: group.status as string, count: group._count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private async operationsSummary(now: Date): Promise<AdminDashboardSummary["operations"]> {
    const [pendingDeletionRequests, pastDueCompanies, lockedAccounts] = await Promise.all([
      this.prisma.user.count({ where: { deletionRequestedAt: { not: null } } }),
      this.prisma.company.count({ where: { status: CompanyStatus.past_due } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
    ]);

    return {
      pendingDeletionRequests,
      pastDueCompanies,
      lockedAccounts,
    };
  }

  private async systemHealthSummary(): Promise<AdminDashboardSummary["systemHealth"]> {
    const [database, redis, storage] = await Promise.all([
      this.health
        .database("database")
        .then((result) => mapHealthStatus(result, "database"))
        .catch(() => "down" as const),
      this.health
        .redisCache("redis")
        .then((result) => mapHealthStatus(result, "redis"))
        .catch(() => "down" as const),
      this.health
        .objectStorage("s3")
        .then((result) => mapHealthStatus(result, "s3"))
        .catch(() => "down" as const),
    ]);

    return { database, redis, storage };
  }

  private async registrationSeries(chartStart: Date, todayStart: Date) {
    const rows = await this.prisma.$queryRaw<RegistrationRow[]>`
      SELECT series.day::date AS "day", COALESCE(COUNT(u.id), 0)::int AS "count"
      FROM generate_series(${chartStart}, ${todayStart}, interval '1 day') AS series(day)
      LEFT JOIN "User" u
        ON u."createdAt" >= series.day
        AND u."createdAt" < series.day + interval '1 day'
      GROUP BY series.day
      ORDER BY series.day ASC
    `;

    return rows.map((row) => ({
      date: formatIsoDate(row.day),
      count: Number(row.count),
    }));
  }

  private async recentAuditEvents(): Promise<AdminDashboardSummary["recentAuditEvents"]> {
    const entries = await this.prisma.adminActionLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        actorId: true,
        action: true,
        entityType: true,
        comment: true,
        createdAt: true,
      },
    });
    const actorIds = [...new Set(entries.map((entry) => entry.actorId))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor: actorMap.get(entry.actorId) ?? null,
      entityType: entry.entityType,
      entityLabel: ENTITY_TYPE_LABELS[entry.entityType] ?? entry.entityType,
      comment: entry.comment,
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatIsoDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
}

function mapHealthStatus(result: HealthCheckDetails, key: string): AdminHealthStatus {
  const details = result[key];
  if (!details || details.status === "down") {
    return "down";
  }

  if (details.configured === false && details.required !== true) {
    return "disabled";
  }

  return details.status === "up" ? "ok" : "down";
}
