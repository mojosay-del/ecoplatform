import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type AdminActionLogInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  comment?: string;
  payload?: Prisma.InputJsonValue;
};

export type AuditSnapshot = Record<string, unknown>;

export type AuditDiffEntry = { before: unknown; after: unknown };

export type RecordChangeInput = {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  comment?: string;
  before: AuditSnapshot;
  after: AuditSnapshot;
  extra?: Record<string, unknown>;
};

// Shallow diff: для каждого ключа в объединении before/after сравниваем
// значения через JSON-стабильное сравнение (массивы ролей и вложенные объекты
// одинакового состава считаются равными). Возвращаем только изменённые поля.
export function computeDiff(before: AuditSnapshot, after: AuditSnapshot): Record<string, AuditDiffEntry> {
  const keys = new Set<string>([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diff: Record<string, AuditDiffEntry> = {};
  for (const key of keys) {
    const a = before?.[key];
    const b = after?.[key];
    if (!stableEqual(a, b)) {
      diff[key] = { before: a ?? null, after: b ?? null };
    }
  }
  return diff;
}

function stableEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

@Injectable()
export class AdminActionLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AdminActionLogInput) {
    return this.prisma.adminActionLog.create({
      data: {
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        comment: input.comment,
        payload: input.payload,
      },
    });
  }

  // Единый формат для админ-действий, меняющих состояние сущности.
  // payload = { before, after, diff, ...extra } — UI рендерит diff цветами,
  // полные before/after остаются для аудита.
  async recordChange(input: RecordChangeInput) {
    const diff = computeDiff(input.before, input.after);
    const payload: Record<string, unknown> = {
      before: input.before,
      after: input.after,
      diff,
      ...(input.extra ?? {}),
    };
    return this.record({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      comment: input.comment,
      payload: payload as Prisma.InputJsonValue,
    });
  }
}
