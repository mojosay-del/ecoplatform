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
}
