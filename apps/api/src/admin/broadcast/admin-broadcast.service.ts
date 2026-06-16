import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { CompanyRole, NotificationCategory, Prisma, UserStatus } from "@prisma/client";
import type { z } from "zod";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import type { broadcastAudienceSchema, broadcastSendInputSchema } from "./admin-broadcast.schemas";

type Audience = z.infer<typeof broadcastAudienceSchema>;
type SendInput = z.infer<typeof broadcastSendInputSchema>;

// Сколько уведомлений создаём за раз: createInApp на каждого получателя делает
// свою транзакцию, поэтому шлём пачками, чтобы не выгрести пул соединений.
const SEND_CHUNK = 50;

// Рассылка системных in-app уведомлений от платформы с фильтрами по аудитории.
// Канал только in-app: категория `system` в NotificationsService не ставит
// email в очередь и не подчиняется mute — сообщение увидят все получатели.
@Injectable()
export class AdminBroadcastService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  private buildWhere(audience: Audience): Prisma.UserWhereInput {
    const where: Prisma.UserWhereInput = {
      status: audience.includeBlocked ? undefined : UserStatus.active,
    };
    if (audience.gender) where.gender = audience.gender;
    if (audience.companyRole) where.companyRole = audience.companyRole as CompanyRole;

    const company: Prisma.CompanyWhereInput = {};
    if (audience.companyType) company.type = audience.companyType;
    if (audience.subscriptionPlan) company.subscriptionPlan = audience.subscriptionPlan;
    if (Object.keys(company).length > 0) where.company = { is: company };

    return where;
  }

  async recipientsCount(audience: Audience): Promise<{ recipientCount: number }> {
    const recipientCount = await this.prisma.user.count({ where: this.buildWhere(audience) });
    return { recipientCount };
  }

  async send(input: SendInput, user: RequestUser): Promise<{ recipientCount: number }> {
    const where = this.buildWhere(input.audience);
    const recipients = await this.prisma.user.findMany({ where, select: { id: true } });
    const domainEventBase = `admin.broadcast:${randomUUID()}`;

    for (let i = 0; i < recipients.length; i += SEND_CHUNK) {
      const chunk = recipients.slice(i, i + SEND_CHUNK);
      await Promise.all(
        chunk.map((recipient) =>
          this.notifications.createInApp({
            userId: recipient.id,
            eventType: "admin.broadcast",
            domainEventId: `${domainEventBase}:${recipient.id}`,
            category: NotificationCategory.system,
            title: input.title,
            body: input.body,
            link: input.link,
          }),
        ),
      );
    }

    await this.auditLog.record({
      actorId: user.id,
      action: "admin.broadcast.send",
      entityType: "InAppNotification",
      entityId: domainEventBase,
      payload: {
        title: input.title,
        recipientCount: recipients.length,
        audience: input.audience,
      },
    });

    return { recipientCount: recipients.length };
  }
}
