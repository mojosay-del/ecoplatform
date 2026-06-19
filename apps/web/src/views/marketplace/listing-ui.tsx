"use client";

// Общие отображаемые куски торговой площадки: статус-бейдж, форматтеры, карточка
// объявления и хук справочника номенклатуры. Держим отдельно, чтобы лента,
// кабинет и детальная карточка не дублировали разметку.

import Link from "next/link";
import type {
  ListingStatus,
  MarketplaceListingListItem,
  MarketplaceListingPositionSummary,
  MarketplaceNomenclatureOption,
} from "@ecoplatform/shared";
import { Mail, Star } from "lucide-react";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { useApiQuery } from "../shared";
import { expiryLabel, formatDistanceKm, isExpiringSoon } from "./listing-card-meta";
import { formatWeight } from "./listing-format";
import { materialColor } from "./materials";
import { formatRatingValue } from "./review-rating";

// Re-export, чтобы существующие импортёры `formatWeight` из ./listing-ui работали.
export { formatWeight } from "./listing-format";

export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  draft: "Черновик",
  active: "Активно",
  archived: "Архив",
};

export const LISTING_ARCHIVE_REASON_LABEL = {
  sold: "Продано",
  expired: "Истёк срок",
  withdrawn: "Снято вами",
  removed_by_moderator: "Снято модератором",
  not_settled: "Сделка не закрыта в срок",
} as const;

export const LISTING_FORM_LABEL: Record<string, string> = {
  pressed: "Тюки",
  loose: "Россыпь",
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <span className={`mp-badge mp-badge-${status}`}>{LISTING_STATUS_LABEL[status]}</span>;
}

export function archiveReasonLabel(reason: string | null): string | null {
  if (!reason || !(reason in LISTING_ARCHIVE_REASON_LABEL)) {
    return null;
  }
  return LISTING_ARCHIVE_REASON_LABEL[reason as keyof typeof LISTING_ARCHIVE_REASON_LABEL];
}

export function formatLocation(city: string, region: string | null): string {
  return region && region !== city ? `${region}, ${city}` : city;
}

export function positionsSummaryText(positions: MarketplaceListingPositionSummary[]): string {
  return positions.map((position) => position.nomenclatureName).join(", ") || "Без позиций";
}

export function totalWeightKg(positions: MarketplaceListingPositionSummary[]): number {
  return positions.reduce((sum, position) => sum + position.weightKg, 0);
}

// Справочник видов сырья для селектов формы объявления.
export function useNomenclatureOptions(): MarketplaceNomenclatureOption[] {
  return useApiQuery(
    queryKeys.marketplace.nomenclature(),
    () => api.marketplace.nomenclature(),
    [] as MarketplaceNomenclatureOption[],
  ).data;
}

// Карточка объявления в публичной ленте. coverUrl резолвится в родителе по
// coverFileId (батч через useFileAssetsByIds), чтобы не делать запрос на карточку.
export function ListingCard({
  listing,
  coverUrl,
  distanceKm,
  highlighted,
  onOpen,
  onHover,
}: {
  listing: MarketplaceListingListItem;
  coverUrl: string | null;
  // Расстояние от адреса компании до центра круга (если адрес геокодирован).
  distanceKm?: number | null;
  // Подсветка при наведении на объект карты (обратная hover-синхронизация).
  highlighted?: boolean;
  // Если задан — клик открывает модалку (без навигации), но href остаётся для
  // deep-link/доступности и открытия в новой вкладке.
  onOpen?: (id: string) => void;
  // Hover карточки подсвечивает круг/точку на карте; null — курсор увели.
  onHover?: (id: string | null) => void;
}) {
  // Уникальные категории сырья — те же цвета, что круги/точки на карте.
  const materialSlugs = [...new Set(listing.positions.map((position) => position.categorySlug))];
  const forms = [
    ...new Set(
      listing.positions
        .map((position) => LISTING_FORM_LABEL[position.form])
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  const expiry = isExpiringSoon(listing.expiresAt) ? expiryLabel(listing.expiresAt) : null;
  const distanceText = distanceKm != null ? formatDistanceKm(distanceKm) : "";

  return (
    <Link
      className={`mp-card${highlighted ? " is-map-hover" : ""}`}
      href={`/marketplace/${listing.id}`}
      onClick={
        onOpen
          ? (event) => {
              event.preventDefault();
              onOpen(listing.id);
            }
          : undefined
      }
      onMouseEnter={onHover ? () => onHover(listing.id) : undefined}
      onMouseLeave={onHover ? () => onHover(null) : undefined}
    >
      <div className="mp-card-cover">
        {coverUrl ? <img alt="" src={coverUrl} /> : <div className="mp-card-cover-empty">Нет фото</div>}
        {expiry ? <span className="mp-card-expiry">{expiry}</span> : null}
        {listing.photoCount > 1 ? <span className="mp-card-photos">{listing.photoCount} фото</span> : null}
      </div>
      <div className="mp-card-body">
        <div className="mp-card-positions">
          <span aria-hidden="true" className="mp-card-materials">
            {materialSlugs.map((slug) => (
              <i key={slug} className="mp-material-dot" style={{ backgroundColor: materialColor(slug) }} />
            ))}
          </span>
          {positionsSummaryText(listing.positions)}
        </div>
        <div className="mp-card-meta">
          <span>
            {formatLocation(listing.city, listing.region)}
            {distanceText ? ` · ${distanceText}` : ""}
          </span>
          <span className="mp-card-weight">{formatWeight(totalWeightKg(listing.positions))}</span>
        </div>
        <div className="mp-card-meta">
          <span>{forms.join(" · ")}</span>
          <span className="mp-card-meta-right">
            {listing.offerCount > 0 ? (
              <span aria-label={`Подано предложений: ${listing.offerCount}`} className="mp-card-offers">
                <Mail aria-hidden="true" size={12} />
                {listing.offerCount}
              </span>
            ) : null}
            {listing.sellerRating != null ? (
              <span
                aria-label={`Рейтинг продавца ${formatRatingValue(listing.sellerRating)} из 5`}
                className="mp-card-rating"
              >
                <Star aria-hidden="true" size={13} />
                {formatRatingValue(listing.sellerRating)}
              </span>
            ) : null}
          </span>
        </div>
      </div>
    </Link>
  );
}

// Скелетон карточки на время загрузки ленты — резервирует место под cover и
// две строки текста, чтобы грид не прыгал при появлении данных.
export function ListingCardSkeleton() {
  return (
    <div aria-hidden="true" className="mp-card mp-card-skeleton">
      <div className="mp-card-cover" />
      <div className="mp-card-body">
        <span className="mp-skeleton-line" style={{ width: "78%" }} />
        <span className="mp-skeleton-line" style={{ width: "52%" }} />
      </div>
    </div>
  );
}
