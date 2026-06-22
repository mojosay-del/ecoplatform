import type { ForumAuthorReputation } from "@ecoplatform/shared";
import { publicUrl } from "../files/files-storage.helpers";
import type { PrismaService } from "../prisma/prisma.service";

export type ForumReputationMap = Map<string, ForumAuthorReputation>;

// Репутация автора, когда пользователь не найден (удалён). Карточка остаётся
// валидной, без раскрытия деталей.
export function fallbackReputation(userId: string): ForumAuthorReputation {
  return {
    userId,
    name: "Участник",
    avatarUrl: null,
    companyType: null,
    companyName: null,
    isPlatformStaff: false,
    verified: false,
    rating: null,
    dealsCompleted: 0,
    forumSolved: 0,
  };
}

// Собирает репутацию авторов БАТЧЕМ (на страницу ответов/ленты — один проход),
// чтобы не дёргать marketplace на каждый ответ. Источники (ничего не дублируем):
//  - User: имя, аватар, компания (тип = роль, статус = «проверенный»);
//  - CompanyMarketplaceRating.overall — общий рейтинг (null, если нет отзывов);
//  - Offer.dealResult=agreed (как покупатель ИЛИ продавец) — число сделок;
//  - ForumAnswer.isAccepted by authorId — «решено на форуме» (метрика форума).
export async function buildForumReputationMap(prisma: PrismaService, authorIds: string[]): Promise<ForumReputationMap> {
  const ids = [...new Set(authorIds.filter(Boolean))];
  const map: ForumReputationMap = new Map();
  if (ids.length === 0) return map;

  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      companyId: true,
      avatarFile: { select: { storageKey: true, accessLevel: true } },
      company: { select: { type: true, organizationName: true, status: true } },
      platformStaff: { select: { isActive: true, roles: true } },
    },
  });

  const companyIds = [
    ...new Set(users.map((user) => user.companyId).filter((value): value is string => Boolean(value))),
  ];

  const ratings = companyIds.length
    ? await prisma.companyMarketplaceRating.findMany({
        where: { companyId: { in: companyIds } },
        select: { companyId: true, overall: true, reviewCount: true },
      })
    : [];
  const ratingByCompany = new Map(
    ratings.map((rating) => [rating.companyId, rating.reviewCount > 0 ? Number(rating.overall) : null] as const),
  );

  const dealsByCompany = await countAgreedDealsByCompany(prisma, companyIds);

  const solved = await prisma.forumAnswer.groupBy({
    by: ["authorId"],
    where: { authorId: { in: ids }, parentAnswerId: null, isAccepted: true, hidden: false },
    _count: { _all: true },
  });
  const solvedByAuthor = new Map(solved.map((row) => [row.authorId, row._count._all] as const));

  for (const user of users) {
    map.set(user.id, {
      userId: user.id,
      name: displayName(user.firstName, user.lastName),
      avatarUrl: user.avatarFile ? publicUrl(user.avatarFile.storageKey, user.avatarFile.accessLevel) : null,
      companyType: user.company?.type ?? null,
      companyName: user.company?.organizationName ?? null,
      isPlatformStaff: Boolean(user.platformStaff?.isActive && user.platformStaff.roles.length > 0),
      // «Проверенный» — компания с активной (оплаченной) подпиской.
      verified: user.company?.status === "active",
      rating: user.companyId ? (ratingByCompany.get(user.companyId) ?? null) : null,
      dealsCompleted: user.companyId ? (dealsByCompany.get(user.companyId) ?? 0) : 0,
      forumSolved: solvedByAuthor.get(user.id) ?? 0,
    });
  }
  return map;
}

// «Имя Ф.» — без раскрытия полной фамилии.
function displayName(firstName: string, lastName: string): string {
  const trimmedLast = lastName?.trim();
  const initial = trimmedLast ? `${trimmedLast.charAt(0).toUpperCase()}.` : "";
  return [firstName?.trim(), initial].filter(Boolean).join(" ") || "Участник";
}

// Сделки компании = состоявшиеся (agreed) офферы, где она покупатель или продавец.
async function countAgreedDealsByCompany(prisma: PrismaService, companyIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (companyIds.length === 0) return result;

  const asBuyer = await prisma.offer.groupBy({
    by: ["buyerCompanyId"],
    where: { dealResult: "agreed", buyerCompanyId: { in: companyIds } },
    _count: { _all: true },
  });
  for (const row of asBuyer) {
    result.set(row.buyerCompanyId, (result.get(row.buyerCompanyId) ?? 0) + row._count._all);
  }

  // Продавец: группировки по связанной таблице нет — считаем через listing.
  const asSeller = await prisma.offer.findMany({
    where: { dealResult: "agreed", listing: { sellerCompanyId: { in: companyIds } } },
    select: { listing: { select: { sellerCompanyId: true } } },
  });
  for (const row of asSeller) {
    const companyId = row.listing.sellerCompanyId;
    result.set(companyId, (result.get(companyId) ?? 0) + 1);
  }
  return result;
}
