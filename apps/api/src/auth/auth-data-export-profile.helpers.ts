import { PrismaService } from "../prisma/prisma.service";

export function loadExportUserProfile(prisma: PrismaService, userId: string) {
  return prisma.user.findUnique({
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
}

export function loadExportCompany(prisma: PrismaService, companyId: string | null) {
  if (!companyId) return Promise.resolve(null);
  return prisma.company.findUnique({
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

export function loadExportSessions(prisma: PrismaService, userId: string) {
  return prisma.session.findMany({
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

export function loadExportConsents(prisma: PrismaService, userId: string) {
  return prisma.consentRecord.findMany({
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
