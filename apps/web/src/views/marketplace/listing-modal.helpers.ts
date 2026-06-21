import type { LucideIcon } from "lucide-react";
import { CreditCard, Droplets, Filter, Weight } from "lucide-react";
import type { MarketplaceListingDetail, MarketplaceListingMediaItem } from "@ecoplatform/shared";
import type { FileAsset } from "../../lib/api";
import { preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { contaminationLabel, moistureLabel } from "./listing-characteristics";
import { LISTING_FORM_LABEL } from "./listing-ui";

export type ListingModalProductFact = {
  icon: LucideIcon;
  label: string;
  value: string;
};

export type ListingModalMediaItem = MarketplaceListingMediaItem & {
  kind: "photo" | "video";
};

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function tons(kg: number | null): string {
  if (kg == null) return "—";
  const value = kg / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} т`;
}

export function listingModalMediaItems(listing: MarketplaceListingDetail): ListingModalMediaItem[] {
  return listing.media.filter((item): item is ListingModalMediaItem => item.kind === "photo" || item.kind === "video");
}

export function selectedListingModalMedia(
  mediaItems: ListingModalMediaItem[],
  activeMedia: number,
  assets: Map<string, FileAsset>,
) {
  const selectedMedia = mediaItems[activeMedia] ?? mediaItems[0];
  const selectedAsset = selectedMedia ? assets.get(selectedMedia.fileId) : undefined;
  return {
    selectedMedia,
    selectedAsset,
    activePhotoUrl: selectedMedia?.kind === "photo" ? preferredFileAssetImageUrl(selectedAsset) : null,
    activeVideoUrl: selectedMedia?.kind === "video" ? preferredFileAssetMediaUrl(selectedAsset) : null,
  };
}

export function listingModalLightboxItems(mediaItems: ListingModalMediaItem[], assets: Map<string, FileAsset>) {
  return mediaItems.map((media) => {
    const asset = assets.get(media.fileId);
    return {
      id: media.id,
      kind: media.kind,
      url: media.kind === "video" ? preferredFileAssetMediaUrl(asset) : preferredFileAssetImageUrl(asset),
    };
  });
}

export function listingTotalWeight(listing: MarketplaceListingDetail): number {
  return listing.positions.reduce((sum, position) => sum + position.weightKg, 0);
}

export function listingForms(listing: MarketplaceListingDetail): string {
  return [...new Set(listing.positions.map((position) => LISTING_FORM_LABEL[position.form] ?? position.form))].join(
    ", ",
  );
}

export function listingProductFacts(listing: MarketplaceListingDetail): ListingModalProductFact[] {
  const moisture = moistureLabel(listing.positions.find((position) => position.moistureCondition));
  const contamination = contaminationLabel(listing.positions.find((position) => position.contaminationCondition));
  return [
    moisture ? { icon: Droplets, label: "Влажность", value: moisture } : null,
    contamination ? { icon: Filter, label: "Иные включения", value: contamination } : null,
    listing.paymentTerms ? { icon: CreditCard, label: "Оплата", value: listing.paymentTerms } : null,
    listing.typicalLoadKg != null
      ? { icon: Weight, label: "Обычно гружу в машину", value: tons(listing.typicalLoadKg) }
      : null,
  ].filter((item): item is ListingModalProductFact => Boolean(item));
}
