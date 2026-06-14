import { ContentStatus, type Prisma } from "@prisma/client";

// Строит вложенный include для публичного дерева документации на нужную глубину:
// 1 — только сам узел (+ файл), 2 — + опубликованные дети, 3 — + внуки. На
// каждом уровне дети фильтруются по status=published, сортируются по position и
// ограничены width штук на родителя. Блоки описания в дерево НЕ тянем — они
// нужны только на странице документа (см. getDocument), а лента/карточки
// обходятся метаданными узла и файла.
export function buildDocumentationTreeInclude(depth: number, width: number): Prisma.DocumentationArticleInclude {
  if (depth <= 1) {
    return { file: true };
  }
  return {
    file: true,
    children: {
      where: { status: ContentStatus.published },
      orderBy: { position: "asc" as const },
      take: width,
      include: buildDocumentationTreeInclude(depth - 1, width),
    },
  };
}
