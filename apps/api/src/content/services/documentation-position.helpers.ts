import type { Prisma } from "@prisma/client";

// Перепаковка позиций внутри одной родительской группы дерева документации.
// Уникальный индекс не позволяет двум узлам занимать одну позицию — даже
// временно. Поэтому сначала уводим всех соседей в заведомо свободную зону
// отрицательных значений, а потом раздаём финальные номера 0..N-1 в нужном порядке.
export async function repositionDocumentationInGroup(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  itemId: string,
  newPosition: number,
  isNewcomer: boolean,
) {
  const siblings = await tx.documentationArticle.findMany({
    where: { parentId, id: { not: itemId } },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  if (!isNewcomer) {
    await tx.documentationArticle.update({ where: { id: itemId }, data: { position: -1 } });
  }
  for (let i = 0; i < siblings.length; i++) {
    await tx.documentationArticle.update({
      where: { id: siblings[i]!.id },
      data: { position: -(i + 2) },
    });
  }

  const ordered = siblings.map((s) => s.id);
  const clamped = Math.max(0, Math.min(newPosition, ordered.length));
  ordered.splice(clamped, 0, itemId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.documentationArticle.update({ where: { id: ordered[i]! }, data: { position: i } });
  }
}

// При переходе документа в другую родительскую группу — нужно «закрыть дыру»,
// которую он оставил: оставшиеся соседи перенумеровываются без него.
export async function compactDocumentationAfterRemoval(
  tx: Prisma.TransactionClient,
  parentId: string | null,
  removedPosition: number,
) {
  const remaining = await tx.documentationArticle.findMany({
    where: { parentId, position: { gt: removedPosition } },
    orderBy: { position: "asc" },
    select: { id: true, position: true },
  });
  for (const node of remaining) {
    await tx.documentationArticle.update({
      where: { id: node.id },
      data: { position: node.position - 1 },
    });
  }
}
