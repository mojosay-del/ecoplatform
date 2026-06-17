import { describe, expect, it } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import { CompanyRole } from "@prisma/client";
import type { CompanyAccessSnapshot } from "@ecoplatform/shared";
import {
  assertCompanyOwner,
  assertCompanyTypeIn,
  assertFunctionalAccess,
  canSeeListingContacts,
  companyHasFunctionalAccess,
  hasAnyRole,
  hasFunctionalAccess,
  isCompanyOwner,
  isListingOwner,
  isPlatformAdmin,
  isPlatformStaff,
} from "./access-policy";
import type { RequestUser } from "./request-user";

const HOUR = 60 * 60 * 1000;

// Активная demo (заканчивается в будущем) → функциональный доступ открыт.
const demoActive: CompanyAccessSnapshot = {
  type: "collector",
  status: "demo",
  demoEndsAt: new Date(Date.now() + HOUR),
  subscriptionPlan: null,
  subscriptionEndsAt: null,
};

// Истёкшая demo → доступа нет.
const demoExpired: CompanyAccessSnapshot = {
  ...demoActive,
  demoEndsAt: new Date(Date.now() - HOUR),
};

const baseUser: RequestUser = {
  id: "user-1",
  email: "user@example.test",
  firstName: "Иван",
  lastName: "Иванов",
  phone: "+70000000000",
  companyId: "company-1",
  companyRole: CompanyRole.owner,
  platformRoles: [],
  company: demoActive,
  sessionId: "session-1",
};

const member: RequestUser = { ...baseUser, companyRole: CompanyRole.member };
const admin: RequestUser = {
  ...baseUser,
  companyId: null,
  companyRole: CompanyRole.owner,
  company: null,
  platformRoles: ["admin"],
};
const moderator: RequestUser = { ...admin, platformRoles: ["moderator"] };

describe("access-policy: платформенные роли", () => {
  it("isPlatformStaff: стафф с ролью — да, юзер компании — нет", () => {
    expect(isPlatformStaff(admin)).toBe(true);
    expect(isPlatformStaff(moderator)).toBe(true);
    expect(isPlatformStaff(baseUser)).toBe(false);
  });

  it("isPlatformAdmin: только admin", () => {
    expect(isPlatformAdmin(admin)).toBe(true);
    expect(isPlatformAdmin(moderator)).toBe(false);
    expect(isPlatformAdmin(baseUser)).toBe(false);
  });

  it("hasAnyRole: пересечение с ожидаемыми ролями", () => {
    expect(hasAnyRole(moderator, ["admin", "moderator"])).toBe(true);
    expect(hasAnyRole(moderator, ["admin"])).toBe(false);
    expect(hasAnyRole(baseUser, ["admin", "moderator", "content_manager"])).toBe(false);
  });
});

describe("access-policy: роль владельца", () => {
  it("isCompanyOwner: owner с компанией — да; member и стафф — нет", () => {
    expect(isCompanyOwner(baseUser)).toBe(true);
    expect(isCompanyOwner(member)).toBe(false);
    expect(isCompanyOwner(admin)).toBe(false);
  });

  it("assertCompanyOwner: возвращает companyId владельцу, режет member и без компании", () => {
    expect(assertCompanyOwner(baseUser, "нет компании")).toBe("company-1");
    expect(() => assertCompanyOwner(member, "нет компании")).toThrow(ForbiddenException);
    expect(() => assertCompanyOwner(admin, "нет компании")).toThrow("нет компании");
  });
});

describe("access-policy: функциональный доступ", () => {
  it("companyHasFunctionalAccess: только по компании, без staff-исключения", () => {
    expect(companyHasFunctionalAccess(baseUser)).toBe(true);
    expect(companyHasFunctionalAccess({ ...baseUser, company: demoExpired })).toBe(false);
    expect(companyHasFunctionalAccess(admin)).toBe(false); // стафф без компании НЕ проходит
  });

  it("hasFunctionalAccess: стафф проходит всегда, юзеру нужна активная demo/подписка", () => {
    expect(hasFunctionalAccess(admin)).toBe(true);
    expect(hasFunctionalAccess(baseUser)).toBe(true);
    expect(hasFunctionalAccess({ ...baseUser, company: demoExpired })).toBe(false);
    expect(hasFunctionalAccess({ ...baseUser, company: null })).toBe(false);
  });

  it("assertFunctionalAccess: бросает с переданным сообщением при отказе", () => {
    expect(() => assertFunctionalAccess(baseUser)).not.toThrow();
    expect(() => assertFunctionalAccess({ ...baseUser, company: demoExpired }, "Доступ к площадке ограничен")).toThrow(
      "Доступ к площадке ограничен",
    );
  });
});

describe("access-policy: тип компании", () => {
  it("assertCompanyTypeIn: пропускает нужный тип, режет чужой/без компании", () => {
    expect(assertCompanyTypeIn(baseUser, ["collector"], "только заготовители")).toBe("company-1");
    expect(() =>
      assertCompanyTypeIn({ ...baseUser, company: { ...demoActive, type: "trader" } }, ["collector"], "x"),
    ).toThrow(ForbiddenException);
    expect(
      assertCompanyTypeIn({ ...baseUser, company: { ...demoActive, type: "trader" } }, ["trader", "processor"], "x"),
    ).toBe("company-1");
    expect(() => assertCompanyTypeIn(admin, ["collector"], "x")).toThrow(ForbiddenException);
    // companyId есть, но снапшот компании отсутствует → отказ (как `company?.type !== X`).
    expect(() => assertCompanyTypeIn({ ...baseUser, company: null }, ["collector"], "x")).toThrow(ForbiddenException);
  });
});

describe("access-policy: объявление площадки", () => {
  it("isListingOwner: совпадение компании продавца", () => {
    expect(isListingOwner(baseUser, "company-1")).toBe(true);
    expect(isListingOwner(baseUser, "company-2")).toBe(false);
    expect(isListingOwner(admin, "company-1")).toBe(false); // у стаффа нет companyId
  });

  it("canSeeListingContacts: владелец и админ видят контакты, посторонний — нет", () => {
    expect(canSeeListingContacts(baseUser, "company-1")).toBe(true); // владелец
    expect(canSeeListingContacts(admin, "company-1")).toBe(true); // админ
    expect(canSeeListingContacts(moderator, "company-1")).toBe(false); // не владелец и не админ
    expect(canSeeListingContacts(baseUser, "company-2")).toBe(false); // чужое объявление
  });
});
