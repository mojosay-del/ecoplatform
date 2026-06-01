import { Injectable, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  navItemKeyForGuardKey,
  navMenuItems,
  navSectionKeys,
  navSectionTitles,
  isNavMenuItemKey,
  type AdminNavResponse,
  type NavVisibilityResponse,
} from "@ecoplatform/shared";
import { AdminActionLogService } from "../common/admin-action-log.service";
import type { RequestUser } from "../common/request-user";
import { PrismaService } from "../prisma/prisma.service";

// Ключ в таблице PlatformSetting, под которым хранится список скрытых пунктов
// меню (массив ключей пунктов). Значение по умолчанию — пустой массив (всё
// видно).
const NAV_HIDDEN_SETTING_KEY = "navigation.hidden";

@Injectable()
export class NavigationService implements OnModuleInit {
  // In-memory кеш скрытых ключей: guard зовётся на каждый публичный
  // content-запрос, поэтому ходить в БД на каждый вызов нельзя.
  private hiddenKeys = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  async onModuleInit() {
    await this.refreshCache();
  }

  getHidden(): string[] {
    return [...this.hiddenKeys];
  }

  // Скрыт ли раздел, помеченный данным guardKey. Только из кеша.
  isSectionHidden(guardKey: string): boolean {
    const itemKey = navItemKeyForGuardKey(guardKey);
    return itemKey ? this.hiddenKeys.has(itemKey) : false;
  }

  // Для всех залогиненных: какие пункты скрыты + их href (фронт прячет пункты
  // и редиректит со скрытых путей).
  getVisibilityForClient(): NavVisibilityResponse {
    const hiddenKeys = this.getHidden();
    const hiddenHrefs = navMenuItems
      .filter((item) => item.href && this.hiddenKeys.has(item.key))
      .map((item) => item.href!) as string[];
    return { hiddenKeys, hiddenHrefs };
  }

  // Для админ-редактора: все пункты, сгруппированные по категориям, с флагом
  // hidden.
  getAdminView(): AdminNavResponse {
    return {
      sections: navSectionKeys.map((section) => ({
        key: section,
        title: navSectionTitles[section],
        items: navMenuItems
          .filter((item) => item.section === section)
          .map((item) => ({ ...item, hidden: this.hiddenKeys.has(item.key) })),
      })),
    };
  }

  async setHidden(rawKeys: string[], actor: RequestUser) {
    // Оставляем только известные ключи (устойчивость к рассинхрону версий) и
    // дедуплицируем.
    const nextKeys = [...new Set(rawKeys.filter((key) => isNavMenuItemKey(key)))];
    const before = this.getHidden();

    await this.prisma.platformSetting.upsert({
      where: { key: NAV_HIDDEN_SETTING_KEY },
      update: { value: nextKeys as Prisma.InputJsonValue, updatedById: actor.id },
      create: { key: NAV_HIDDEN_SETTING_KEY, value: nextKeys as Prisma.InputJsonValue, updatedById: actor.id },
    });

    this.hiddenKeys = new Set(nextKeys);

    await this.auditLog.recordChange({
      actorId: actor.id,
      action: "admin.navigation.update",
      entityType: "PlatformSetting",
      entityId: NAV_HIDDEN_SETTING_KEY,
      before: { hiddenKeys: before },
      after: { hiddenKeys: nextKeys },
    });

    return this.getAdminView();
  }

  private async refreshCache() {
    const stored = await this.prisma.platformSetting.findUnique({ where: { key: NAV_HIDDEN_SETTING_KEY } });
    const value = stored?.value;
    const keys = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    this.hiddenKeys = new Set(keys.filter((key) => isNavMenuItemKey(key)));
  }
}
