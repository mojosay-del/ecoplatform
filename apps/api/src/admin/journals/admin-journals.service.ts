import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { paginatedResponse } from "../../common/pagination";
import { PrismaService } from "../../prisma/prisma.service";
import type { adminJournalsQuerySchema } from "./admin-journals.schemas";
import type { z } from "zod";

type JournalsQuery = z.infer<typeof adminJournalsQuerySchema>;

@Injectable()
export class AdminJournalsService {
  constructor(private readonly prisma: PrismaService) {}

  async listEntries(query: JournalsQuery) {
    const where: Prisma.AdminActionLogWhereInput = {};
    if (query.action) where.action = { contains: query.action, mode: "insensitive" };
    if (query.entityType) where.entityType = query.entityType;
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = query.from;
      if (query.to) where.createdAt.lte = query.to;
    }

    const [total, entries] = await Promise.all([
      this.prisma.adminActionLog.count({ where }),
      this.prisma.adminActionLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: query.offset,
        take: query.limit,
      }),
    ]);

    const actorIds = [...new Set(entries.map((entry) => entry.actorId))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const actorMap = new Map(actors.map((actor) => [actor.id, actor]));

    const items = entries.map((entry) => ({
      ...entry,
      actor: actorMap.get(entry.actorId) ?? null,
    }));

    return paginatedResponse(items, total, query);
  }
}
