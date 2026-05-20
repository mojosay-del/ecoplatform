import { BadRequestException, Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";
import {
  platformSettingDefinitions,
  platformSettingKeys,
  type PlatformSettingKey,
  type PlatformSettingValue,
} from "./platform-settings.definitions";

@Injectable()
export class PlatformSettingsService implements OnModuleInit {
  private cache = new Map<PlatformSettingKey, unknown>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  async onModuleInit() {
    await this.seedDefaults();
    await this.refreshCache();
  }

  async getValue<K extends PlatformSettingKey>(key: K): Promise<PlatformSettingValue<K>> {
    if (this.cache.has(key)) {
      return this.cache.get(key) as PlatformSettingValue<K>;
    }

    const stored = await this.prisma.platformSetting.findUnique({ where: { key } });
    if (stored) {
      this.cache.set(key, stored.value);
      return stored.value as PlatformSettingValue<K>;
    }

    return platformSettingDefinitions[key].default as PlatformSettingValue<K>;
  }

  async listSettings() {
    const stored = await this.prisma.platformSetting.findMany({ orderBy: { key: "asc" } });
    const storedMap = new Map(stored.map((item) => [item.key as PlatformSettingKey, item]));

    return platformSettingKeys.map((key) => {
      const definition = platformSettingDefinitions[key];
      const record = storedMap.get(key);
      return {
        key,
        label: definition.label,
        description: definition.description,
        defaultValue: definition.default,
        value: record?.value ?? definition.default,
        updatedAt: record?.updatedAt ?? null,
        updatedById: record?.updatedById ?? null,
      };
    });
  }

  async setValue<K extends PlatformSettingKey>(key: K, value: unknown, actor: RequestUser) {
    const definition = platformSettingDefinitions[key];
    const parsed = definition.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join("; "));
    }

    const before = await this.prisma.platformSetting.findUnique({ where: { key } });
    const updated = await this.prisma.platformSetting.upsert({
      where: { key },
      update: { value: parsed.data as Prisma.InputJsonValue, updatedById: actor.id },
      create: { key, value: parsed.data as Prisma.InputJsonValue, updatedById: actor.id },
    });

    this.cache.set(key, updated.value);

    await this.auditLog.record({
      actorId: actor.id,
      action: "admin.setting.update",
      entityType: "PlatformSetting",
      entityId: key,
      payload: {
        from: before?.value ?? definition.default,
        to: parsed.data,
      },
    });

    return updated;
  }

  private async seedDefaults() {
    for (const key of platformSettingKeys) {
      const definition = platformSettingDefinitions[key];
      await this.prisma.platformSetting.upsert({
        where: { key },
        update: {},
        create: {
          key,
          value: definition.default as Prisma.InputJsonValue,
        },
      });
    }
  }

  private async refreshCache() {
    const stored = await this.prisma.platformSetting.findMany();
    this.cache.clear();
    for (const item of stored) {
      this.cache.set(item.key as PlatformSettingKey, item.value);
    }
  }
}
