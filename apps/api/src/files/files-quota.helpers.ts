import { HttpException, HttpStatus } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const MB_IN_BYTES = 1024 * 1024;

export type FilesQuotaDeps = {
  prisma: PrismaService;
  dailyQuotaMb: () => Promise<number>;
};

// Лимит считаем по всей компании загрузившего (а не по одному пользователю),
// иначе сотрудники одной компании суммарно обходили бы дневной лимит.
async function dailyUploadScopeUserIds(prisma: PrismaService, userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyId: true },
  });
  if (!user?.companyId) {
    return [userId];
  }

  const companyUsers = await prisma.user.findMany({
    where: { companyId: user.companyId },
    select: { id: true },
  });
  return companyUsers.length > 0 ? companyUsers.map((companyUser) => companyUser.id) : [userId];
}

function quotaResetHours(windowStart: Date): number {
  const resetAt = windowStart.getTime() + 24 * 60 * 60 * 1000;
  return Math.max(1, Math.ceil((resetAt - Date.now()) / (60 * 60 * 1000)));
}

export async function assertDailyUploadQuota(
  deps: FilesQuotaDeps,
  userId: string,
  nextFileBytes: number,
): Promise<void> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const userIds = await dailyUploadScopeUserIds(deps.prisma, userId);
  const aggregate = await deps.prisma.fileAsset.aggregate({
    where: {
      uploadedById: { in: userIds },
      createdAt: { gte: windowStart },
    },
    _sum: { sizeBytes: true },
  });
  const usedBytes = aggregate._sum.sizeBytes ?? 0;
  const dailyQuotaBytes = (await deps.dailyQuotaMb()) * MB_IN_BYTES;
  if (usedBytes + nextFileBytes <= dailyQuotaBytes) {
    return;
  }

  throw new HttpException(
    `Дневной лимит загрузок исчерпан. Будет сброшен через ${quotaResetHours(windowStart)} ч.`,
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
