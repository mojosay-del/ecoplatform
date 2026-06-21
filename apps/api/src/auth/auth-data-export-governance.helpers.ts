import { PrismaService } from "../prisma/prisma.service";

export async function loadExportModeration(prisma: PrismaService, userId: string, companyId: string | null) {
  const [complaints, decisions, sanctions, moduleRestrictions] = await Promise.all([
    prisma.complaint.findMany({
      where: { OR: [{ authorId: userId }, ...(companyId ? [{ authorCompanyId: companyId }] : [])] },
      include: { case: { select: { id: true, type: true, status: true, entityType: true, entityId: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.moderationDecision.findMany({
      where: { actorId: userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sanction.findMany({
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
    prisma.userModuleRestriction.findMany({
      where: { OR: [{ userId }, ...(companyId ? [{ companyId }] : [])] },
      orderBy: { appliedAt: "desc" },
    }),
  ]);
  return { complaints, decisions, sanctions, moduleRestrictions };
}

export function loadExportAuditLog(prisma: PrismaService, userId: string, companyId: string | null) {
  return prisma.adminActionLog.findMany({
    where: {
      OR: [{ actorId: userId }, { entityId: userId }, ...(companyId ? [{ entityId: companyId }] : [])],
    },
    orderBy: { createdAt: "desc" },
  });
}
