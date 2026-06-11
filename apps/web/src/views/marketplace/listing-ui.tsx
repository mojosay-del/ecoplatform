"use client";

// Общие отображаемые куски торговой площадки: статус-бейдж, форматтеры, карточка
// объявления и хук справочника номенклатуры. Держим отдельно, чтобы лента,
// кабинет и детальная карточка не дублировали разметку.

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ListingStatus,
  MarketplaceListingListItem,
  MarketplaceListingPositionSummary,
  MarketplaceNomenclatureOption,
} from "@ecoplatform/shared";
import { api } from "../../lib/api";

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

export function formatWeight(kg: number): string {
  if (kg >= 1000) {
    const tons = kg / 1000;
    return `${Number.isInteger(tons) ? tons : tons.toFixed(1)} т`;
  }
  return `${Math.round(kg)} кг`;
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
  const [options, setOptions] = useState<MarketplaceNomenclatureOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    api.marketplace
      .nomenclature()
      .then((result) => {
        if (!cancelled) setOptions(result);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

// Карточка объявления в публичной ленте. coverUrl резолвится в родителе по
// coverFileId (батч через useFileAssetsByIds), чтобы не делать запрос на карточку.
export function ListingCard({
  listing,
  coverUrl,
  onOpen,
}: {
  listing: MarketplaceListingListItem;
  coverUrl: string | null;
  // Если задан — клик открывает модалку (без навигации), но href остаётся для
  // deep-link/доступности и открытия в новой вкладке.
  onOpen?: (id: string) => void;
}) {
  return (
    <Link
      className="mp-card"
      href={`/marketplace/${listing.id}`}
      onClick={
        onOpen
          ? (event) => {
              event.preventDefault();
              onOpen(listing.id);
            }
          : undefined
      }
    >
      <div className="mp-card-cover">
        {coverUrl ? <img alt="" src={coverUrl} /> : <div className="mp-card-cover-empty">Нет фото</div>}
        {listing.photoCount > 1 ? <span className="mp-card-photos">{listing.photoCount} фото</span> : null}
      </div>
      <div className="mp-card-body">
        <div className="mp-card-positions">{positionsSummaryText(listing.positions)}</div>
        <div className="mp-card-meta">
          <span>{formatLocation(listing.city, listing.region)}</span>
          <span className="mp-card-weight">{formatWeight(totalWeightKg(listing.positions))}</span>
        </div>
      </div>
    </Link>
  );
}
