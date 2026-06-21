import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { buildAuthDataExportArchive, type AuthDataExportResult } from "./auth-data-export-archive.helpers";
import {
  loadExportComments,
  loadExportNotificationDeliveries,
  loadExportNotifications,
  loadExportReactions,
  loadExportSupportTickets,
} from "./auth-data-export-communication.helpers";
import {
  loadExportAuthoredContent,
  loadExportFiles,
  loadExportLessonProgress,
} from "./auth-data-export-content.helpers";
import { loadExportAuditLog, loadExportModeration } from "./auth-data-export-governance.helpers";
import {
  loadExportCompany,
  loadExportConsents,
  loadExportSessions,
  loadExportUserProfile,
} from "./auth-data-export-profile.helpers";

@Injectable()
export class AuthDataExportService {
  constructor(private readonly prisma: PrismaService) {}

  async exportUserData(userId: string): Promise<AuthDataExportResult> {
    const generatedAt = new Date();
    const user = await loadExportUserProfile(this.prisma, userId);

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
      loadExportCompany(this.prisma, companyId),
      loadExportSessions(this.prisma, userId),
      loadExportConsents(this.prisma, userId),
      loadExportNotifications(this.prisma, userId),
      loadExportNotificationDeliveries(this.prisma, userId),
      loadExportSupportTickets(this.prisma, companyId),
      loadExportLessonProgress(this.prisma, userId),
      loadExportComments(this.prisma, userId),
      loadExportReactions(this.prisma, userId),
      loadExportModeration(this.prisma, userId, companyId),
      loadExportFiles(this.prisma, userId),
      loadExportAuthoredContent(this.prisma, userId),
      loadExportAuditLog(this.prisma, userId, companyId),
    ]);

    return buildAuthDataExportArchive({
      generatedAt,
      userId,
      companyId,
      profile: user,
      company,
      consents,
      sessions,
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
    });
  }
}
