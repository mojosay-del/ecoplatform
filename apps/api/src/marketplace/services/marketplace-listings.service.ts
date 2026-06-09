import { Injectable } from "@nestjs/common";
import type { MarketplaceListingListItem, PaginatedResponse } from "@ecoplatform/shared";
import type { RequestUser } from "../../common/request-user";
import { PrismaService } from "../../prisma/prisma.service";

type ListParams = { limit?: number; offset?: number };

// Сервис объявлений торговой площадки. На этапе фундамента — только публичная
// лента активных объявлений (пока пустая). На фазе объявлений здесь появятся
// создание/публикация/архивация, фильтры по сырью и региону, сортировка.
@Injectable()
export class MarketplaceListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic(
    _user: RequestUser,
    params: ListParams,
  ): Promise<PaginatedResponse<MarketplaceListingListItem>> {
    const take = params.limit ?? 20;
    const skip = params.offset ?? 0;

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.marketplaceListing.findMany({
        where: { status: "active" },
        orderBy: { publishedAt: "desc" },
        skip,
        take,
        include: {
          address: { select: { city: true, region: true } },
          positions: {
            orderBy: { position: "asc" },
            include: { nomenclature: { select: { name: true } } },
          },
          sellerCompany: { select: { type: true } },
          _count: { select: { media: true } },
        },
      }),
      this.prisma.marketplaceListing.count({ where: { status: "active" } }),
    ]);

    const items: MarketplaceListingListItem[] = rows.map((row) => ({
      id: row.id,
      status: row.status,
      city: row.address.city,
      region: row.address.region,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      photoCount: row._count.media,
      sellerType: row.sellerCompany.type,
      // Рейтинг продавца подключается на фазе отзывов; до неё — «Рейтинг отсутствует».
      sellerRating: null,
      positions: row.positions.map((position) => ({
        nomenclatureId: position.nomenclatureId,
        nomenclatureName: position.nomenclature.name,
        weightKg: Number(position.weightKg),
        form: position.form,
      })),
    }));

    return { items, total, hasMore: skip + rows.length < total };
  }
}
