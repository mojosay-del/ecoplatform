import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export const RESTRICTABLE_MODULES = ["comments", "marketplace", "reviews"] as const;
export type RestrictableModule = (typeof RESTRICTABLE_MODULES)[number];

@Injectable()
export class ModuleAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertModuleAccess(userId: string, moduleCode: RestrictableModule): Promise<void> {
    const active = await this.prisma.userModuleRestriction.findFirst({
      where: {
        userId,
        moduleCode,
        liftedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: "desc" },
    });

    if (active) {
      throw new ForbiddenException(
        `Доступ к модулю ограничен по решению модерации до ${active.expiresAt.toISOString().slice(0, 10)}.`,
      );
    }
  }
}
