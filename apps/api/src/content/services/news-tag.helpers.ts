import { slugify } from "@ecoplatform/shared";
import type { PrismaService } from "../../prisma/prisma.service";

export function normaliseTagFilters(tagNames: string[] = []): string[] {
  return uniqueTagNames(tagNames);
}

// Поддерживаем 3 запроса вне зависимости от длины списка:
// createMany недостающих тегов, findMany их id, createMany связей с новостью.
export async function replaceNewsTags(prisma: PrismaService, newsPostId: string, tagNames: string[], actorId: string) {
  const uniqueNames = uniqueTagNames(tagNames);
  if (uniqueNames.length === 0) {
    return;
  }

  await prisma.newsTag.createMany({
    data: uniqueNames.map((name) => ({
      name,
      slug: slugify(name),
      createdById: actorId,
    })),
    skipDuplicates: true,
  });

  const tags = await prisma.newsTag.findMany({
    where: { name: { in: uniqueNames } },
    select: { id: true },
  });

  await prisma.newsPostTag.createMany({
    data: tags.map((tag) => ({ newsPostId, newsTagId: tag.id })),
    skipDuplicates: true,
  });

  await refreshTagUsage(
    prisma,
    tags.map((tag) => tag.id),
  );
}

export async function refreshTagUsage(prisma: PrismaService, tagIds: string[]) {
  const unique = Array.from(new Set(tagIds));
  if (unique.length === 0) {
    return;
  }

  const counts = await prisma.newsPostTag.groupBy({
    by: ["newsTagId"],
    where: { newsTagId: { in: unique } },
    _count: { newsTagId: true },
  });
  const countMap = new Map(counts.map((row) => [row.newsTagId, row._count.newsTagId]));

  await Promise.all(
    unique.map((tagId) =>
      prisma.newsTag.update({
        where: { id: tagId },
        data: { usageCount: countMap.get(tagId) ?? 0 },
      }),
    ),
  );
}

function uniqueTagNames(tagNames: string[]): string[] {
  return Array.from(new Set(tagNames.map((name) => name.trim()).filter(Boolean)));
}
