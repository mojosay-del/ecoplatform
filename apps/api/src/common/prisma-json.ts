import type { Prisma } from "@prisma/client";

// Prisma требует более узкий тип для записи Json-полей, чем валидированные DTO
// без индексной сигнатуры. Держим этот мост в одном месте.
export function toPrismaJson<T>(value: T): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}
