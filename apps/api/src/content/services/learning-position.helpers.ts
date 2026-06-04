import type { Prisma } from "@prisma/client";

export async function repositionChapter(
  tx: Prisma.TransactionClient,
  moduleId: string,
  itemId: string,
  newPosition: number,
) {
  const siblings = await tx.chapter.findMany({
    where: { moduleId, id: { not: itemId } },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  await tx.chapter.update({ where: { id: itemId }, data: { position: -1 } });
  for (let i = 0; i < siblings.length; i++) {
    await tx.chapter.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
  }

  const ordered = siblings.map((s) => s.id);
  const clamped = Math.max(0, Math.min(newPosition, ordered.length));
  ordered.splice(clamped, 0, itemId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.chapter.update({ where: { id: ordered[i]! }, data: { position: i } });
  }
}

export async function repositionLearningModule(tx: Prisma.TransactionClient, itemId: string, newPosition: number) {
  const siblings = await tx.learningModule.findMany({
    where: { id: { not: itemId } },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: { id: true },
  });

  const ordered = siblings.map((s) => s.id);
  const clamped = Math.max(0, Math.min(newPosition, ordered.length));
  ordered.splice(clamped, 0, itemId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.learningModule.update({ where: { id: ordered[i]! }, data: { position: i } });
  }
}

export async function repositionLesson(
  tx: Prisma.TransactionClient,
  chapterId: string,
  itemId: string,
  newPosition: number,
) {
  const siblings = await tx.lesson.findMany({
    where: { chapterId, id: { not: itemId } },
    orderBy: { position: "asc" },
    select: { id: true },
  });

  await tx.lesson.update({ where: { id: itemId }, data: { position: -1 } });
  for (let i = 0; i < siblings.length; i++) {
    await tx.lesson.update({ where: { id: siblings[i]!.id }, data: { position: -(i + 2) } });
  }

  const ordered = siblings.map((s) => s.id);
  const clamped = Math.max(0, Math.min(newPosition, ordered.length));
  ordered.splice(clamped, 0, itemId);

  for (let i = 0; i < ordered.length; i++) {
    await tx.lesson.update({ where: { id: ordered[i]! }, data: { position: i } });
  }
}
