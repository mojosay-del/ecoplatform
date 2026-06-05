import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../../prisma/prisma.service";

export function isKnowledgeCategory(iconType?: string | null) {
  return iconType === "category";
}

// Дерево базы знаний ограничено тремя уровнями (категория → вид → подвид).
// Проверяем, что добавление/перемещение узла под parentId не нарушит лимит.
export async function assertKnowledgeDepth(prisma: PrismaService, parentId: string | null, movingId?: string) {
  if (!parentId) {
    return;
  }

  const depth = await knowledgeDepth(prisma, parentId);
  // Допустимы уровни 0, 1, 2. Новый ребёнок добавит уровень depth+1.
  if (depth + 1 > 2) {
    throw new ForbiddenException("Дерево базы знаний ограничено тремя уровнями.");
  }

  if (movingId) {
    const subtree = await subtreeDepth(prisma, movingId);
    if (depth + 1 + subtree > 2) {
      throw new ForbiddenException("Перемещение нарушит ограничение в три уровня.");
    }
  }
}

// Глубина узла = число предков до корня. Set visited страхует от циклов в данных.
export async function knowledgeDepth(prisma: PrismaService, nodeId: string): Promise<number> {
  let current: string | null = nodeId;
  let depth = 0;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) {
      throw new ForbiddenException("Циклическая структура в дереве базы знаний.");
    }
    visited.add(current);
    const node: { parentId: string | null } | null = await prisma.knowledgeBaseArticle.findUnique({
      where: { id: current },
      select: { parentId: true },
    });
    if (!node) {
      break;
    }
    if (node.parentId === null) {
      return depth;
    }
    depth += 1;
    current = node.parentId;
  }

  return depth;
}

// Высота поддерева под nodeId (0 — лист). Нужна, чтобы перемещение целой ветки
// не «выпихнуло» её листья за лимит глубины.
export async function subtreeDepth(prisma: PrismaService, nodeId: string): Promise<number> {
  const children = await prisma.knowledgeBaseArticle.findMany({
    where: { parentId: nodeId },
    select: { id: true },
  });
  if (children.length === 0) {
    return 0;
  }
  const depths = await Promise.all(children.map((child) => subtreeDepth(prisma, child.id)));
  return 1 + Math.max(...depths);
}
