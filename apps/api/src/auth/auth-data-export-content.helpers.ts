import { PrismaService } from "../prisma/prisma.service";

export function loadExportLessonProgress(prisma: PrismaService, userId: string) {
  return prisma.lessonProgress.findMany({
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

export function loadExportFiles(prisma: PrismaService, userId: string) {
  return prisma.fileAsset.findMany({
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

export async function loadExportAuthoredContent(prisma: PrismaService, userId: string) {
  const [newsPosts, priceIndices, learningModules, chapters, knowledgeBaseArticles] = await Promise.all([
    prisma.newsPost.findMany({
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
    prisma.priceIndex.findMany({
      where: { createdById: userId },
      select: { id: true, nomenclatureId: true, description: true, status: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.learningModule.findMany({
      where: { createdById: userId },
      select: { id: true, title: true, status: true, accessLevel: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.chapter.findMany({
      where: { createdById: userId },
      select: { id: true, moduleId: true, title: true, position: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.knowledgeBaseArticle.findMany({
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
