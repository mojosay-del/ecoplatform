import { ForbiddenException } from "@nestjs/common";
import { CompanyRole } from "@prisma/client";
import {
  canOpenFunctionalSections,
  hasAnyPlatformRole,
  hasPlatformRole,
} from "@ecoplatform/shared";
import type { CompanyType, PlatformRole } from "@ecoplatform/shared";
import type { RequestUser } from "./request-user";

// ─────────────────────────────────────────────────────────────────────────────
// Единый слой прав (политики доступа). Раньше эти предикаты были скопированы
// по сервисам/контроллерам (функциональный гейт подписки, тип компании,
// владелец/админ/контакты), что грозило рассинхроном при росте. Здесь —
// один источник истины. Функции чистые (без DI/БД): принимают уже собранного
// `RequestUser`, тривиально тестируются и импортируются откуда угодно.
//
// Доменные проверки, которым нужна БД (`ModuleAccessService.assertModuleAccess`),
// и subscription/type-предикаты (`packages/shared/access.ts`) остаются на местах —
// этот модуль на них опирается, а не дублирует.
// ─────────────────────────────────────────────────────────────────────────────

const FUNCTIONAL_ACCESS_DENIED = "Доступ к разделу ограничен. Активируйте подписку в кабинете.";

// ── Платформенные роли ──────────────────────────────────────────────────────

// Платформенный сотрудник (admin/moderator/content_manager) — у такого нет
// компании, и он проходит функциональные гейты без подписки.
export function isPlatformStaff(user: RequestUser): boolean {
  return user.platformRoles.length > 0;
}

export function isPlatformAdmin(user: RequestUser): boolean {
  return hasPlatformRole(user.platformRoles, "admin");
}

// Используется RolesGuard и точечными проверками: есть ли у юзера хотя бы одна
// из ожидаемых платформенных ролей.
export function hasAnyRole(user: RequestUser, expected: PlatformRole[]): boolean {
  return hasAnyPlatformRole(user.platformRoles, expected);
}

// ── Роль в компании ─────────────────────────────────────────────────────────

export function isCompanyOwner(user: RequestUser): boolean {
  return Boolean(user.companyId) && user.companyRole === CompanyRole.owner;
}

// ── Функциональный доступ (demo / активная подписка) ─────────────────────────

// Только по компании, БЕЗ исключения для платформенного стаффа. Нужен там, где
// доступ должен иметь именно пользователь компании (например, подача жалобы).
export function companyHasFunctionalAccess(user: RequestUser): boolean {
  return Boolean(user.company && canOpenFunctionalSections(user.company));
}

// Полный гейт рабочих разделов: платформенный стафф проходит всегда, остальным
// нужна активная demo/подписка. Это поведение content-домена и площадки.
export function hasFunctionalAccess(user: RequestUser): boolean {
  return isPlatformStaff(user) || companyHasFunctionalAccess(user);
}

export function assertFunctionalAccess(user: RequestUser, message: string = FUNCTIONAL_ACCESS_DENIED): void {
  if (!hasFunctionalAccess(user)) {
    throw new ForbiddenException(message);
  }
}

// ── Владелец биллинга ────────────────────────────────────────────────────────

// Управлять биллингом/профилем компании может только владелец. Возвращает
// companyId для скоупинга запроса.
export function assertCompanyOwner(
  user: RequestUser,
  noCompanyMessage: string,
  notOwnerMessage = "Управлять биллингом может только владелец компании.",
): string {
  if (!user.companyId) {
    throw new ForbiddenException(noCompanyMessage);
  }
  if (user.companyRole !== CompanyRole.owner) {
    throw new ForbiddenException(notOwnerMessage);
  }
  return user.companyId;
}

// ── Тип компании ─────────────────────────────────────────────────────────────

// Действие доступно только компаниям заданного типа (collector / trader+processor
// и т.п.). Возвращает companyId. Платформенный стафф (без компании) НЕ проходит —
// инструменты типа компании предназначены самим компаниям.
export function assertCompanyTypeIn(
  user: RequestUser,
  types: readonly CompanyType[],
  message: string,
): string {
  if (!user.companyId || !user.company || !types.includes(user.company.type)) {
    throw new ForbiddenException(message);
  }
  return user.companyId;
}

// ── Объявление площадки: владелец / видимость контактов ──────────────────────

// Владелец объявления — компания-продавец.
export function isListingOwner(user: RequestUser, sellerCompanyId: string): boolean {
  return Boolean(user.companyId && sellerCompanyId === user.companyId);
}

// Кому раскрываем точный адрес/телефон: владельцу и админу (закрытый аукцион
// скрывает контакты от прочих до акцепта).
export function canSeeListingContacts(user: RequestUser, sellerCompanyId: string): boolean {
  return isListingOwner(user, sellerCompanyId) || isPlatformAdmin(user);
}
