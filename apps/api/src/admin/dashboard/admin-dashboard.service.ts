import { Injectable } from "@nestjs/common";
import { ModerationCaseStatus, SubscriptionPlan, SubscriptionStatus, SupportTicketStatus } from "@prisma/client";
import type { AdminDashboardSummary } from "@ecoplatform/shared";
import { PrismaService } from "../../prisma/prisma.service";

type RegistrationRow = {
  day: Date | string;
  count: number | bigint;
};

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
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<AdminDashboardSummary> {
    const now = new Date();
    const todayStart = startOfDay(now);
    const tomorrowStart = addDays(todayStart, 1);
    const chartStart = addDays(todayStart, -29);
    const expiringCutoff = addDays(now, 7);

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
      business,
      registrationSeries: registrationRows,
      recentAuditEvents,
    };
  }

  private async businessSummary(now: Date): Promise<AdminDashboardSummary["business"]> {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalCompanies, convertedCompanies, newSubscriptionsThisMonth, planGroups, statusGroups] =
      await Promise.all([
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
      ]);

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
