import { Prisma } from "@prisma/client";
import type { AuthMeUser } from "@ecoplatform/shared";
import { PrismaService } from "../prisma/prisma.service";

const ACCOUNT_DELETION_GRACE_DAYS = 30;

const authMeUserSelect = {
  id: true,
  email: true,
  phone: true,
  firstName: true,
  lastName: true,
  gender: true,
  status: true,
  companyId: true,
  deletionRequestedAt: true,
  company: {
    select: {
      id: true,
      organizationName: true,
      type: true,
      status: true,
      demoEndsAt: true,
      subscriptionPlan: true,
      subscriptionEndsAt: true,
    },
  },
  platformStaff: { select: { isActive: true, roles: true } },
} satisfies Prisma.UserSelect;

export type AuthProfileDeps = {
  prisma: PrismaService;
};

export async function getAuthMeUser(deps: AuthProfileDeps, userId: string): Promise<AuthMeUser> {
  const user = await deps.prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: authMeUserSelect,
  });

  const platformRoles = user.platformStaff?.isActive ? user.platformStaff.roles : [];

  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    gender: user.gender,
    status: user.status,
    avatarUrl: resolveProfileAvatarUrl(platformRoles, user.company?.type ?? null, user.gender),
    companyId: user.companyId,
    company: user.company
      ? {
          id: user.company.id,
          organizationName: user.company.organizationName,
          type: user.company.type,
          status: user.company.status,
          demoEndsAt: user.company.demoEndsAt?.toISOString() ?? null,
          subscriptionPlan: user.company.subscriptionPlan,
          subscriptionEndsAt: user.company.subscriptionEndsAt?.toISOString() ?? null,
        }
      : null,
    platformRoles,
    requiresReConsent: await hasPendingRequiredConsent(deps, userId),
    deletionRequestedAt: user.deletionRequestedAt?.toISOString() ?? null,
    deletionScheduledFor: user.deletionRequestedAt
      ? accountDeletionScheduledFor(user.deletionRequestedAt).toISOString()
      : null,
  };
}

export function accountDeletionScheduledFor(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

// requiresReConsent=true означает, что после последнего входа была
// опубликована новая версия обязательного документа, и пользователь её
// ещё не подтвердил. ConsentRecord имеет уникальный (userId, documentId):
// каждая новая версия = новая строка LegalDocument, поэтому отсутствие записи
// на конкретную активную версию = pending.
async function hasPendingRequiredConsent(deps: AuthProfileDeps, userId: string): Promise<boolean> {
  const requiredActive = await deps.prisma.legalDocument.findMany({
    where: { isActive: true, isRequired: true },
    select: { id: true },
  });
  if (requiredActive.length === 0) return false;
  const acceptedCount = await deps.prisma.consentRecord.count({
    where: { userId, documentId: { in: requiredActive.map((document) => document.id) } },
  });
  return acceptedCount < requiredActive.length;
}

function resolveProfileAvatarUrl(platformRoles: string[], companyType: string | null, gender: string): string | null {
  const platformPrefix = platformRoles.includes("admin")
    ? "a"
    : platformRoles.includes("moderator") || platformRoles.includes("content_manager")
      ? "m"
      : null;
  const suffix = avatarSuffixByGender[gender];

  if (platformPrefix && suffix) {
    return `/avatars/platform/${platformPrefix}${suffix}.png`;
  }

  const companyPrefix = companyType ? companyAvatarPrefixByType[companyType] : null;
  if (!companyPrefix || !suffix) return null;

  return `/avatars/company/${companyPrefix}${suffix}.png`;
}

const companyAvatarPrefixByType: Record<string, string> = {
  collector: "z",
  trader: "t",
  processor: "p",
};

const avatarSuffixByGender: Record<string, string> = {
  male: "man",
  female: "woman",
};
