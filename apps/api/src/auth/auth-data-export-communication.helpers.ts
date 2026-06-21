import { PrismaService } from "../prisma/prisma.service";

export function loadExportNotifications(prisma: PrismaService, userId: string) {
  return prisma.inAppNotification.findMany({
    where: { userId },
    select: {
      id: true,
      domainEventId: true,
      eventType: true,
      sourceId: true,
      category: true,
      title: true,
      body: true,
      link: true,
      payload: true,
      readAt: true,
      archivedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function loadExportNotificationDeliveries(prisma: PrismaService, userId: string) {
  return prisma.notificationDelivery.findMany({
    where: { recipientUserId: userId },
    select: {
      id: true,
      domainEventId: true,
      eventType: true,
      channel: true,
      address: true,
      status: true,
      attempt: true,
      providerErrorCode: true,
      providerErrorText: true,
      queuedAt: true,
      finishedAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export function loadExportSupportTickets(prisma: PrismaService, companyId: string | null) {
  if (!companyId) return Promise.resolve([]);
  return prisma.supportTicket.findMany({
    where: { companyId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { updatedAt: "desc" },
  });
}

export function loadExportComments(prisma: PrismaService, userId: string) {
  return prisma.comment.findMany({
    where: { userId },
    include: {
      discussion: { select: { targetType: true, targetId: true } },
      attachments: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function loadExportReactions(prisma: PrismaService, userId: string) {
  const [newsLikes, commentLikes] = await Promise.all([
    prisma.newsLike.findMany({
      where: { userId },
      select: {
        id: true,
        newsPostId: true,
        createdAt: true,
        newsPost: { select: { title: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.commentLike.findMany({
      where: { userId },
      select: { id: true, commentId: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return { newsLikes, commentLikes };
}
