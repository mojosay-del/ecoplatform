import { NotificationCategory, NotificationChannel } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { NotificationsService } from "./notifications.service";

// Лёгкий мок PrismaService: реализует только то, что трогает NotificationsService.
// $transaction вызываем синхронно с тем же объектом — заменять tx-таблицы не нужно.
function buildPrismaMock(options: {
  preferences?: { inAppMutedCategories: NotificationCategory[]; emailMutedCategories: NotificationCategory[] } | null;
  userEmail?: string | null;
  admins?: Array<{ userId: string }>;
}) {
  const preferences = options.preferences ?? null;
  const userEmail = options.userEmail ?? null;
  const admins = options.admins ?? [];

  const deliveryUpsert = vi.fn(({ create }) => Promise.resolve({ id: `delivery-${create.channel}`, ...create }));
  const notificationUpsert = vi.fn(({ create }) => Promise.resolve({ id: `note-${create.domainEventId}`, ...create }));

  const tx = {
    notificationDelivery: { upsert: deliveryUpsert },
    inAppNotification: { upsert: notificationUpsert },
  };

  const prisma: any = {
    userNotificationPreferences: {
      findUnique: vi.fn().mockResolvedValue(preferences),
      upsert: vi.fn(({ create, update }) => Promise.resolve({ ...create, ...update })),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(userEmail ? { email: userEmail } : null),
    },
    platformStaff: {
      findMany: vi.fn().mockResolvedValue(admins),
    },
    notificationDelivery: { upsert: deliveryUpsert },
    inAppNotification: { upsert: notificationUpsert },
    $transaction: (callback: (tx: typeof prisma) => unknown) => Promise.resolve(callback(prisma)),
  };

  return { prisma, deliveryUpsert, notificationUpsert };
}

describe("NotificationsService", () => {
  it("два вызова createInApp с одинаковым eventType+sourceId используют один domainEventId", async () => {
    const { prisma, notificationUpsert } = buildPrismaMock({
      preferences: null,
      userEmail: "user@test.local",
    });
    const service = new NotificationsService(prisma);

    await service.createInApp({
      userId: "user-1",
      eventType: "auth.login",
      sourceId: "device-1",
      category: NotificationCategory.security,
      title: "Вход",
      body: "—",
    });
    await service.createInApp({
      userId: "user-1",
      eventType: "auth.login",
      sourceId: "device-1",
      category: NotificationCategory.security,
      title: "Вход",
      body: "—",
    });

    const wheres = notificationUpsert.mock.calls.map((args) => args[0].where.domainEventId_userId.domainEventId);
    expect(wheres).toEqual(["auth.login:device-1", "auth.login:device-1"]);
    // dedupe-флаг на стороне БД: upsert по тому же составному ключу = update.
    expect(notificationUpsert).toHaveBeenCalledTimes(2);
  });

  it("security не отключается через mute — уведомление создаётся даже если категория в inAppMutedCategories", async () => {
    const { prisma, notificationUpsert } = buildPrismaMock({
      preferences: {
        inAppMutedCategories: [NotificationCategory.security, NotificationCategory.billing],
        emailMutedCategories: [],
      },
      userEmail: "user@test.local",
    });
    const service = new NotificationsService(prisma);

    const result = await service.createInApp({
      userId: "user-1",
      eventType: "auth.login",
      category: NotificationCategory.security,
      title: "Вход",
      body: "—",
    });

    expect(result).not.toBeNull();
    expect(notificationUpsert).toHaveBeenCalledTimes(1);
  });

  it("отключаемая категория (moderation) с mute → createInApp возвращает null, ничего не пишет в БД", async () => {
    const { prisma, notificationUpsert, deliveryUpsert } = buildPrismaMock({
      preferences: {
        inAppMutedCategories: [NotificationCategory.moderation],
        emailMutedCategories: [],
      },
    });
    const service = new NotificationsService(prisma);

    const result = await service.createInApp({
      userId: "user-1",
      eventType: "moderation.warning.issued",
      category: NotificationCategory.moderation,
      title: "Предупреждение",
      body: "—",
    });

    expect(result).toBeNull();
    expect(notificationUpsert).not.toHaveBeenCalled();
    expect(deliveryUpsert).not.toHaveBeenCalled();
  });

  it("email-канал ставит запись queued; если категория замьючена в email — записи нет", async () => {
    const { prisma, deliveryUpsert } = buildPrismaMock({
      preferences: {
        inAppMutedCategories: [],
        emailMutedCategories: [NotificationCategory.moderation],
      },
      userEmail: "user@test.local",
    });
    const service = new NotificationsService(prisma);

    // moderation замьючен в email → email-доставка не создаётся.
    await service.createInApp({
      userId: "user-1",
      eventType: "moderation.warning.issued",
      category: NotificationCategory.moderation,
      title: "Предупреждение",
      body: "—",
    });

    const moderationChannels = deliveryUpsert.mock.calls.map((args) => args[0].create.channel);
    expect(moderationChannels).toEqual([NotificationChannel.in_app]);

    deliveryUpsert.mockClear();

    // security НЕ замьючен → email-доставка создаётся параллельно.
    await service.createInApp({
      userId: "user-1",
      eventType: "auth.login",
      category: NotificationCategory.security,
      title: "Вход",
      body: "—",
    });
    const securityChannels = deliveryUpsert.mock.calls.map((args) => args[0].create.channel);
    expect(securityChannels).toEqual(expect.arrayContaining([NotificationChannel.in_app, NotificationChannel.email]));
  });

  it("createInAppForAdmins зовёт createInApp для каждого активного админа и не для других", async () => {
    const { prisma, notificationUpsert } = buildPrismaMock({
      preferences: null,
      userEmail: "admin@test.local",
      admins: [{ userId: "admin-1" }, { userId: "admin-2" }],
    });
    const service = new NotificationsService(prisma);

    await service.createInAppForAdmins({
      eventType: "system.event",
      category: NotificationCategory.system,
      title: "—",
      body: "—",
    });

    expect(prisma.platformStaff.findMany).toHaveBeenCalledWith({
      where: { isActive: true, roles: { has: "admin" } },
      select: { userId: true },
    });
    const recipientIds = notificationUpsert.mock.calls.map((args) => args[0].create.userId);
    expect(recipientIds).toEqual(["admin-1", "admin-2"]);
  });

  it("updatePreferences молча отбрасывает security/billing из inAppMutedCategories", async () => {
    const { prisma } = buildPrismaMock({});
    const service = new NotificationsService(prisma);

    await service.updatePreferences(
      { id: "user-1", platformRoles: [], companyId: null, sessionId: "" } as any,
      {
        inAppMutedCategories: [
          NotificationCategory.security,
          NotificationCategory.billing,
          NotificationCategory.moderation,
        ],
        emailMutedCategories: [NotificationCategory.billing, NotificationCategory.support],
      },
    );

    const args = prisma.userNotificationPreferences.upsert.mock.calls[0]?.[0];
    expect(args.create.inAppMutedCategories).toEqual([NotificationCategory.moderation]);
    expect(args.create.emailMutedCategories).toEqual([NotificationCategory.support]);
    expect(args.update.inAppMutedCategories).toEqual([NotificationCategory.moderation]);
    expect(args.update.emailMutedCategories).toEqual([NotificationCategory.support]);
  });
});
