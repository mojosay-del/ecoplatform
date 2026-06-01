import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  NotificationCategory,
  NotificationChannel,
  NotificationDeliveryStatus,
  PlatformRole,
  Prisma,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestUser } from "../common/request-user";
import { recordNotificationSent } from "../observability/metrics.registry";

export type CreateInAppNotificationInput = {
  userId: string;
  eventType: string;
  sourceId?: string;
  domainEventId?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string;
  payload?: Prisma.InputJsonValue;
};

export type NotificationPreferencesInput = {
  inAppMutedCategories: NotificationCategory[];
  emailMutedCategories: NotificationCategory[];
};

type NotificationPreferencesOutput = NotificationPreferencesInput;

const MUTABLE_CATEGORIES = new Set<NotificationCategory>([
  NotificationCategory.security,
  NotificationCategory.billing,
  NotificationCategory.marketplace,
  NotificationCategory.moderation,
  NotificationCategory.support,
  NotificationCategory.system,
]);

const publicNotificationSelect = {
  id: true,
  category: true,
  eventType: true,
  title: true,
  body: true,
  link: true,
  readAt: true,
  archivedAt: true,
  createdAt: true,
} satisfies Prisma.InAppNotificationSelect;

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createInApp(input: CreateInAppNotificationInput) {
    const prefs = await this.prisma.userNotificationPreferences.findUnique({
      where: { userId: input.userId },
    });
    const inAppMuted = MUTABLE_CATEGORIES.has(input.category) && prefs?.inAppMutedCategories.includes(input.category);

    const domainEventId =
      input.domainEventId ?? this.buildDomainEventId(input.eventType, input.sourceId ?? input.userId);
    const now = new Date();

    // Email-канал: задел на будущее. Email-провайдера пока нет, поэтому
    // создаём NotificationDelivery со статусом `queued` — когда появится
    // воркер отправки, он подберёт эти записи и пометит как delivered/failed.
    // Дублирование в системной категории и при mute не делаем.
    const emailQueued =
      input.category !== NotificationCategory.system &&
      !(MUTABLE_CATEGORIES.has(input.category) && prefs?.emailMutedCategories.includes(input.category));
    const emailAddress = await this.lookupEmailAddress(input.userId);

    const notification = await this.prisma.$transaction(async (tx) => {
      if (emailQueued && emailAddress) {
        await tx.notificationDelivery.upsert({
          where: {
            domainEventId_recipientUserId_channel: {
              domainEventId,
              recipientUserId: input.userId,
              channel: NotificationChannel.email,
            },
          },
          create: {
            domainEventId,
            eventType: input.eventType,
            recipientUserId: input.userId,
            channel: NotificationChannel.email,
            address: emailAddress,
            status: NotificationDeliveryStatus.queued,
            attempt: 0,
          },
          update: {},
        });
      }

      if (inAppMuted) {
        return null;
      }

      const delivery = await tx.notificationDelivery.upsert({
        where: {
          domainEventId_recipientUserId_channel: {
            domainEventId,
            recipientUserId: input.userId,
            channel: NotificationChannel.in_app,
          },
        },
        create: {
          domainEventId,
          eventType: input.eventType,
          recipientUserId: input.userId,
          channel: NotificationChannel.in_app,
          address: input.userId,
          status: NotificationDeliveryStatus.delivered,
          attempt: 1,
          finishedAt: now,
        },
        update: {},
      });

      return tx.inAppNotification.upsert({
        where: { domainEventId_userId: { domainEventId, userId: input.userId } },
        create: {
          userId: input.userId,
          deliveryId: delivery.id,
          domainEventId,
          eventType: input.eventType,
          sourceId: input.sourceId,
          category: input.category,
          title: input.title,
          body: input.body,
          link: input.link,
          payload: input.payload,
        },
        update: { deliveryId: delivery.id },
      });
    });
    if (!inAppMuted) {
      recordNotificationSent(input.category, "in_app");
    }
    if (emailQueued && emailAddress) {
      recordNotificationSent(input.category, "email");
    }
    return notification;
  }

  private async lookupEmailAddress(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return user?.email ?? null;
  }

  async createInAppForAdmins(input: Omit<CreateInAppNotificationInput, "userId">) {
    const admins = await this.prisma.platformStaff.findMany({
      where: { isActive: true, roles: { has: PlatformRole.admin } },
      select: { userId: true },
    });

    return Promise.all(admins.map((admin) => this.createInApp({ ...input, userId: admin.userId })));
  }

  async list(user: RequestUser, options: { includeArchived?: boolean; limit?: number; offset?: number } = {}) {
    const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const where: Prisma.InAppNotificationWhereInput = {
      userId: user.id,
      ...(options.includeArchived ? {} : { archivedAt: null }),
    };

    const [total, items] = await Promise.all([
      this.prisma.inAppNotification.count({ where }),
      this.prisma.inAppNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: publicNotificationSelect,
      }),
    ]);

    return { items, total, hasMore: offset + items.length < total };
  }

  async unreadCount(user: RequestUser) {
    const count = await this.prisma.inAppNotification.count({
      where: { userId: user.id, readAt: null, archivedAt: null },
    });
    return { count };
  }

  async markRead(id: string, user: RequestUser) {
    await this.assertOwnership(id, user);
    return this.prisma.inAppNotification.update({
      where: { id },
      data: { readAt: new Date() },
      select: publicNotificationSelect,
    });
  }

  async markAllRead(user: RequestUser) {
    const result = await this.prisma.inAppNotification.updateMany({
      where: { userId: user.id, readAt: null, archivedAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  async archive(id: string, user: RequestUser) {
    await this.assertOwnership(id, user);
    return this.prisma.inAppNotification.update({
      where: { id },
      data: { archivedAt: new Date(), readAt: new Date() },
      select: publicNotificationSelect,
    });
  }

  async getPreferences(user: RequestUser): Promise<NotificationPreferencesOutput> {
    const prefs = await this.prisma.userNotificationPreferences.findUnique({
      where: { userId: user.id },
    });
    return this.serializePreferences(prefs);
  }

  async updatePreferences(
    user: RequestUser,
    input: NotificationPreferencesInput,
  ): Promise<NotificationPreferencesOutput> {
    const inAppMutedCategories = this.keepMutableCategories(input.inAppMutedCategories);
    const emailMutedCategories = this.keepMutableCategories(input.emailMutedCategories);

    const prefs = await this.prisma.userNotificationPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, inAppMutedCategories, emailMutedCategories },
      update: { inAppMutedCategories, emailMutedCategories },
    });
    return this.serializePreferences(prefs);
  }

  private async assertOwnership(id: string, user: RequestUser) {
    const found = await this.prisma.inAppNotification.findUnique({ where: { id }, select: { userId: true } });
    if (!found) {
      throw new NotFoundException("Уведомление не найдено.");
    }
    if (found.userId !== user.id) {
      throw new ForbiddenException("Чужое уведомление.");
    }
  }

  private buildDomainEventId(eventType: string, sourceId: string) {
    return `${eventType}:${sourceId}`;
  }

  private keepMutableCategories(categories: NotificationCategory[]) {
    return [...new Set(categories)].filter((category) => MUTABLE_CATEGORIES.has(category));
  }

  private serializePreferences(
    prefs: { inAppMutedCategories: NotificationCategory[]; emailMutedCategories: NotificationCategory[] } | null,
  ): NotificationPreferencesOutput {
    return {
      inAppMutedCategories: prefs?.inAppMutedCategories ?? [],
      emailMutedCategories: prefs?.emailMutedCategories ?? [],
    };
  }
}
