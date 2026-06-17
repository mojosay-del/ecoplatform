import { Injectable, Logger } from "@nestjs/common";
import { ForumQuestionStatus, NotificationCategory, PlatformRole } from "@prisma/client";
import { swallowAndLog } from "../common/silent-catch";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

const DEFAULT_THRESHOLD_HOURS = 24;
const MAX_QUESTIONS_PER_RUN = 50;

function truncate(text: string, max = 80): string {
  const clean = text.trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

// Пинг контент-менеджерам/админам о вопросах без ответа дольше N часов (ТЗ §9).
// Вызывается кроном (SchedulerService). Дедуп: domainEventId уникален на вопрос,
// upsert createInApp гарантирует один пинг на (вопрос, сотрудник).
@Injectable()
export class ForumNudgeService {
  private readonly logger = new Logger(ForumNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async notifyStaleUnanswered(
    now = new Date(),
    thresholdHours = DEFAULT_THRESHOLD_HOURS,
  ): Promise<{ notified: number }> {
    const cutoff = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000);
    const stale = await this.prisma.forumQuestion.findMany({
      where: { status: ForumQuestionStatus.open, answersCount: 0, createdAt: { lt: cutoff } },
      orderBy: { createdAt: "asc" },
      take: MAX_QUESTIONS_PER_RUN,
      select: { id: true, title: true },
    });
    if (stale.length === 0) {
      return { notified: 0 };
    }

    const staff = await this.prisma.platformStaff.findMany({
      where: { isActive: true, roles: { hasSome: [PlatformRole.admin, PlatformRole.content_manager] } },
      select: { userId: true },
    });
    if (staff.length === 0) {
      return { notified: 0 };
    }

    let notified = 0;
    for (const question of stale) {
      for (const member of staff) {
        await this.notifications
          .createInApp({
            userId: member.userId,
            category: NotificationCategory.forum,
            eventType: "forum.unanswered",
            sourceId: question.id,
            // Дедуп на (вопрос, сотрудник) — пинг приходит ровно один раз.
            domainEventId: `forum.unanswered:${question.id}`,
            title: "Вопрос на форуме без ответа",
            body: `«${truncate(question.title)}» больше ${thresholdHours} ч без ответа.`,
            link: `/forum/q/${question.id}`,
          })
          .catch(swallowAndLog("forum.unanswered.notify", { questionId: question.id, userId: member.userId }));
        notified += 1;
      }
    }
    this.logger.log(`Forum unanswered nudge: ${stale.length} questions × ${staff.length} staff`);
    return { notified };
  }
}
