import { Injectable, NotFoundException } from "@nestjs/common";
import { createZip, type ZipFile } from "../common/simple-zip";
import { PrismaService } from "../prisma/prisma.service";

type ExportResult = {
  buffer: Buffer;
  filename: string;
};

@Injectable()
export class AuthDataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportUserData(userId: string): Promise<ExportResult> {
    const generatedAt = new Date();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        firstName: true,
        lastName: true,
        gender: true,
        status: true,
        companyId: true,
        failedLoginAttempts: true,
        failedLoginWindowStartedAt: true,
        lockedUntil: true,
        deletionRequestedAt: true,
        createdAt: true,
        updatedAt: true,
        platformStaff: { select: { roles: true, isActive: true, createdAt: true, updatedAt: true } },
        notificationPreferences: {
          select: { inAppMutedCategories: true, emailMutedCategories: true, updatedAt: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException("Пользователь не найден.");
    }

    const companyId = user.companyId;
    const [
      company,
      sessions,
      consents,
      notifications,
      notificationDeliveries,
      supportTickets,
      lessonProgress,
      comments,
      reactions,
      moderation,
      files,
      authoredContent,
      auditLog,
    ] = await Promise.all([
      this.loadCompany(companyId),
      this.loadSessions(userId),
      this.loadConsents(userId),
      this.loadNotifications(userId),
      this.loadNotificationDeliveries(userId),
      this.loadSupportTickets(companyId),
      this.loadLessonProgress(userId),
      this.loadComments(userId),
      this.loadReactions(userId),
      this.loadModeration(userId, companyId),
      this.loadFiles(userId),
      this.loadAuthoredContent(userId),
      this.loadAuditLog(userId, companyId),
    ]);

    const zipFiles: ZipFile[] = [
      {
        name: "manifest.json",
        data: jsonBuffer({
          generatedAt: generatedAt.toISOString(),
          format: "ecoplatform-personal-data-export-v1",
          userId,
          companyId,
          files: [
            "profile.json",
            "company.json",
            "consents.json",
            "sessions.json",
            "notifications.json",
            "support-tickets.json",
            "learning-progress.json",
            "comments.json",
            "reactions.json",
            "moderation.json",
            "files.json",
            "authored-content.json",
            "audit-log.json",
          ],
          notes: [
            "Пароль, refresh-token hashes, provider tokens и API key hashes не включаются в экспорт.",
            "Файлы включены как metadata FileAsset; бинарные объекты хранятся во внешнем S3-хранилище.",
          ],
        }),
      },
      { name: "profile.json", data: jsonBuffer(user) },
      { name: "company.json", data: jsonBuffer(company) },
      { name: "consents.json", data: jsonBuffer(consents) },
      { name: "sessions.json", data: jsonBuffer(sessions) },
      { name: "notifications.json", data: jsonBuffer({ notifications, notificationDeliveries }) },
      { name: "support-tickets.json", data: jsonBuffer(supportTickets) },
      { name: "learning-progress.json", data: jsonBuffer(lessonProgress) },
      { name: "comments.json", data: jsonBuffer(comments) },
      { name: "reactions.json", data: jsonBuffer(reactions) },
      { name: "moderation.json", data: jsonBuffer(moderation) },
      { name: "files.json", data: jsonBuffer(files) },
      { name: "authored-content.json", data: jsonBuffer(authoredContent) },
      { name: "audit-log.json", data: jsonBuffer(auditLog) },
    ];

    const buffer = createZip(zipFiles, generatedAt);

    return {
      buffer,
      filename: `ecoplatform-data-export-${generatedAt.toISOString().slice(0, 10)}.zip`,
    };
  }

  private loadCompany(companyId: string | null) {
    if (!companyId) return Promise.resolve(null);
    return this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        factualAddress: true,
        structuredLegalAddress: true,
        subscriptions: { orderBy: { createdAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
        paymentMethods: {
          select: {
            id: true,
            companyId: true,
            type: true,
            cardMask: true,
            cardExpiry: true,
            isDefault: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        apiKeys: {
          select: {
            id: true,
            companyId: true,
            name: true,
            scopes: true,
            isActive: true,
            lastUsedAt: true,
            expiresAt: true,
            createdAt: true,
            createdBy: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  private loadSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId },
      select: {
        id: true,
        userAgent: true,
        ipAddress: true,
        rememberMe: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private loadConsents(userId: string) {
    return this.prisma.consentRecord.findMany({
      where: { userId },
      include: {
        document: {
          select: {
            id: true,
            type: true,
            version: true,
            title: true,
            summary: true,
            isRequired: true,
            isActive: true,
            publishedAt: true,
          },
        },
      },
      orderBy: { acceptedAt: "desc" },
    });
  }

  private loadNotifications(userId: string) {
    return this.prisma.inAppNotification.findMany({
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

  private loadNotificationDeliveries(userId: string) {
    return this.prisma.notificationDelivery.findMany({
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

  private loadSupportTickets(companyId: string | null) {
    if (!companyId) return Promise.resolve([]);
    return this.prisma.supportTicket.findMany({
      where: { companyId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  private loadLessonProgress(userId: string) {
    return this.prisma.lessonProgress.findMany({
      where: { userId },
      include: {
        lesson: {
          select: {
            id: true,
            title: true,
            chapter: {
              select: {
                id: true,
                title: true,
                module: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: { completedAt: "desc" },
    });
  }

  private loadComments(userId: string) {
    return this.prisma.comment.findMany({
      where: { userId },
      include: {
        discussion: { select: { targetType: true, targetId: true } },
        attachments: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async loadReactions(userId: string) {
    const [newsLikes, commentLikes] = await Promise.all([
      this.prisma.newsLike.findMany({
        where: { userId },
        select: {
          id: true,
          newsPostId: true,
          createdAt: true,
          newsPost: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.commentLike.findMany({
        where: { userId },
        select: { id: true, commentId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { newsLikes, commentLikes };
  }

  private async loadModeration(userId: string, companyId: string | null) {
    const [complaints, decisions, sanctions, moduleRestrictions] = await Promise.all([
      this.prisma.complaint.findMany({
        where: { OR: [{ authorId: userId }, ...(companyId ? [{ authorCompanyId: companyId }] : [])] },
        include: { case: { select: { id: true, type: true, status: true, entityType: true, entityId: true } } },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.moderationDecision.findMany({
        where: { actorId: userId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.sanction.findMany({
        where: {
          OR: [
            { appliedById: userId },
            { liftedById: userId },
            { targetType: "user", targetId: userId },
            ...(companyId ? [{ targetType: "company", targetId: companyId }] : []),
          ],
        },
        orderBy: { appliedAt: "desc" },
      }),
      this.prisma.userModuleRestriction.findMany({
        where: { OR: [{ userId }, ...(companyId ? [{ companyId }] : [])] },
        orderBy: { appliedAt: "desc" },
      }),
    ]);
    return { complaints, decisions, sanctions, moduleRestrictions };
  }

  private loadFiles(userId: string) {
    return this.prisma.fileAsset.findMany({
      where: { uploadedById: userId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        sizeBytes: true,
        storageKey: true,
        variants: true,
        accessLevel: true,
        uploadedById: true,
        createdAt: true,
        references: { select: { entityType: true, entityId: true, createdAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  private async loadAuthoredContent(userId: string) {
    const [newsPosts, priceIndices, learningModules, chapters, knowledgeBaseArticles] = await Promise.all([
      this.prisma.newsPost.findMany({
        where: { createdById: userId },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          firstPublishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.priceIndex.findMany({
        where: { createdById: userId },
        select: { id: true, nomenclatureId: true, description: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.learningModule.findMany({
        where: { createdById: userId },
        select: { id: true, title: true, status: true, accessLevel: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.chapter.findMany({
        where: { createdById: userId },
        select: { id: true, moduleId: true, title: true, position: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
      }),
      this.prisma.knowledgeBaseArticle.findMany({
        where: { createdById: userId },
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          firstPublishedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
      }),
    ]);
    return { newsPosts, priceIndices, learningModules, chapters, knowledgeBaseArticles };
  }

  private loadAuditLog(userId: string, companyId: string | null) {
    return this.prisma.adminActionLog.findMany({
      where: {
        OR: [{ actorId: userId }, { entityId: userId }, ...(companyId ? [{ entityId: companyId }] : [])],
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

function jsonBuffer(value: unknown): Buffer {
  return Buffer.from(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item), 2),
    "utf8",
  );
}
