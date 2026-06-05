import { ContentStatus, type Prisma } from "@prisma/client";

// Строит вложенный include для публичного дерева базы знаний на нужную глубину:
// 1 — только блоки узла, 2 — + опубликованные дети, 3 — + внуки. На каждом
// уровне дети фильтруются по status=published, сортируются по position и
// ограничены width штук на родителя.
export function buildKnowledgeTreeInclude(depth: number, width: number): Prisma.KnowledgeBaseArticleInclude {
  const blocks = { orderBy: { position: "asc" as const } };
  if (depth <= 1) {
    return { blocks };
  }
  return {
    blocks,
    children: {
      where: { status: ContentStatus.published },
      orderBy: { position: "asc" as const },
      take: width,
      include: buildKnowledgeTreeInclude(depth - 1, width),
    },
  };
}
