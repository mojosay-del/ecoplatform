import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../../prisma/prisma.service";

// Следующая свободная позиция номенклатуры в категории (для новой записи).
export async function nextNomenclaturePosition(prisma: PrismaService, categoryId: string) {
  const last = await prisma.nomenclature.findFirst({
    where: { categoryId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return (last?.position ?? -1) + 1;
}

// Перестановка номенклатуры внутри категории: пересобираем порядок соседей и
// раздаём позиции 0..N-1 (тай-брейк по name/id для стабильного порядка).
export async function reorderNomenclature(
  tx: Prisma.TransactionClient,
  categoryId: string,
  id: string,
  newPosition: number,
) {
  const siblings = await tx.nomenclature.findMany({
    where: { categoryId },
    orderBy: [{ position: "asc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true },
  });
  const ordered = siblings.map((item) => item.id).filter((itemId) => itemId !== id);
  const clamped = Math.max(0, Math.min(newPosition, ordered.length));
  ordered.splice(clamped, 0, id);

  for (let position = 0; position < ordered.length; position++) {
    await tx.nomenclature.update({
      where: { id: ordered[position]! },
      data: { position },
    });
  }
}
