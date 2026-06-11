"use client";

// Просмотр объявления — модальное окно (по макету владельца, в стиле Ecoplatform):
// шапка с продавцом/рейтингом/городом, галерея, характеристики, «О товаре» и
// колонка действий для покупателя. Открывается из
// ленты по клику на карточку или объект карты; та же модалка — за deep-link
// /marketplace/[id]. Цену продавец не ставит (закрытый аукцион), мини-карты нет.

import { useEffect, useState } from "react";
import {
  CalendarDays,
  CreditCard,
  Droplets,
  Filter,
  Layers,
  MapPin,
  Package,
  PlayCircle,
  Scale,
  Star,
  Truck,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { api, preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useApiQuery } from "../shared";
import { CompanyReviews } from "./CompanyReviews";
import { ListingOffersPanel } from "./ListingOffersPanel";
import { compactPositionsTitle } from "./listing-title";
import { LISTING_FORM_LABEL, ListingStatusBadge, formatLocation, formatWeight } from "./listing-ui";
import { MakeOfferForm } from "./MakeOfferForm";
import { ReportControl } from "./ReportControl";

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function tons(kg: number | null): string {
  if (kg == null) return "—";
  const value = kg / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)} т`;
}

const MOISTURE_CONDITION_LABEL = {
  dry: "Сухое",
  slightly_wet: "Немного влажное",
  wet: "Влажное",
} as const;

const CONTAMINATION_CONDITION_LABEL = {
  clean: "Без включений",
  may_have_inclusions: "Могут быть иные включения",
  has_inclusions: "Есть иные включения",
} as const;

function moistureLabel(position: MarketplaceListingDetail["positions"][number] | undefined): string | null {
  if (!position) return null;
  if (position.moistureCondition) return MOISTURE_CONDITION_LABEL[position.moistureCondition];
  return position.moisturePct != null ? `до ${position.moisturePct}%` : null;
}

function contaminationLabel(position: MarketplaceListingDetail["positions"][number] | undefined): string | null {
  if (!position) return null;
  if (position.contaminationCondition) return CONTAMINATION_CONDITION_LABEL[position.contaminationCondition];
  return position.contaminationPct != null ? `до ${position.contaminationPct}%` : null;
}

export function ListingModal({
  listingId,
  onClose,
}: {
  listingId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const { data, state, errorMessage } = useApiQuery(
    `marketplace-listing-${listingId}-${refresh}`,
    () => api.marketplace.get(listingId),
    null as MarketplaceListingDetail | null,
  );
  const [activeMedia, setActiveMedia] = useState(0);

  const assets = useFileAssetsByIds((data?.media ?? []).map((item) => item.fileId));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setActiveMedia(0);
  }, [listingId]);

  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";

  return (
    <div className="mp-modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="mp-modal" onClick={(event) => event.stopPropagation()}>
        <button className="mp-modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>

        {!data ? (
          <p className="page-subtitle" style={{ padding: "80px 0", textAlign: "center" }}>
            {state === "error" ? (errorMessage ?? "Объявление не найдено.") : "Загрузка…"}
          </p>
        ) : (
          (() => {
            const listing = data;
            const mediaItems = listing.media.filter((item) => item.kind === "photo" || item.kind === "video");
            const selectedMedia = mediaItems[activeMedia] ?? mediaItems[0];
            const selectedAsset = selectedMedia ? assets.get(selectedMedia.fileId) : undefined;
            const activePhotoUrl = selectedMedia?.kind === "photo" ? preferredFileAssetImageUrl(selectedAsset) : null;
            const activeVideoUrl = selectedMedia?.kind === "video" ? preferredFileAssetMediaUrl(selectedAsset) : null;
            const totalWeight = listing.positions.reduce((sum, position) => sum + position.weightKg, 0);
            const forms = [
              ...new Set(listing.positions.map((position) => LISTING_FORM_LABEL[position.form] ?? position.form)),
            ].join(", ");
            const moisture = moistureLabel(
              listing.positions.find((position) => position.moistureCondition || position.moisturePct != null),
            );
            const contamination = contaminationLabel(
              listing.positions.find(
                (position) => position.contaminationCondition || position.contaminationPct != null,
              ),
            );
            const productFacts = [
              moisture ? { icon: Droplets, label: "Влажность", value: moisture } : null,
              contamination ? { icon: Filter, label: "Иные включения", value: contamination } : null,
              listing.paymentTerms ? { icon: CreditCard, label: "Оплата", value: listing.paymentTerms } : null,
              listing.typicalLoadKg != null
                ? { icon: Weight, label: "Обычно гружу в машину", value: tons(listing.typicalLoadKg) }
                : null,
            ].filter((item): item is { icon: LucideIcon; label: string; value: string } => Boolean(item));

            return (
              <>
                <div className="mp-modal-header">
                  <div className="mp-modal-seller">
                    <span className={`mp-modal-avatar${listing.seller.avatarUrl ? " has-image" : ""}`}>
                      {listing.seller.avatarUrl ? (
                        <img src={listing.seller.avatarUrl} alt="" />
                      ) : (
                        listing.seller.name.slice(0, 1)
                      )}
                    </span>
                    <div>
                      <div className="mp-modal-seller-name">{listing.seller.name}</div>
                      <div className="mp-modal-seller-meta">
                        <span>
                          <MapPin size={13} aria-hidden="true" /> {formatLocation(listing.city, listing.region)}
                        </span>
                        {listing.seller.rating != null ? (
                          <span className="mp-modal-rating">
                            <Star size={13} aria-hidden="true" /> {listing.seller.rating.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <ListingStatusBadge status={listing.status} />
                </div>

                <div className="mp-modal-main">
                  <div className="mp-modal-gallery">
                    <div className="mp-modal-media-frame">
                      {activePhotoUrl ? (
                        <img className="mp-modal-photo" src={activePhotoUrl} alt="" />
                      ) : activeVideoUrl ? (
                        <video
                          className="mp-modal-video"
                          controls
                          playsInline
                          preload="metadata"
                          src={activeVideoUrl}
                        />
                      ) : selectedMedia?.kind === "video" ? (
                        <div className="mp-modal-media-empty">
                          {selectedAsset ? "Видео обрабатывается" : "Видео загружается"}
                        </div>
                      ) : (
                        <div className="mp-modal-media-empty">Нет фото</div>
                      )}
                    </div>
                    {mediaItems.length > 1 ? (
                      <div className="mp-modal-thumbs">
                        {mediaItems.map((media, index) => {
                          const asset = assets.get(media.fileId);
                          const thumb =
                            media.kind === "video"
                              ? preferredFileAssetMediaUrl(asset)
                              : preferredFileAssetImageUrl(asset);
                          return (
                            <button
                              key={media.id}
                              type="button"
                              className={`mp-modal-thumb${media.kind === "video" ? " is-video" : ""}${
                                index === activeMedia ? " active" : ""
                              }`}
                              onClick={() => setActiveMedia(index)}
                              aria-label={media.kind === "video" ? `Видео ${index + 1}` : `Фото ${index + 1}`}
                            >
                              {media.kind === "video" ? (
                                <>
                                  {thumb ? <video src={thumb} muted playsInline preload="metadata" /> : null}
                                  <span className="mp-modal-thumb-play" aria-hidden="true">
                                    <PlayCircle size={18} />
                                  </span>
                                </>
                              ) : thumb ? (
                                <img src={thumb} alt="" />
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="mp-modal-facts">
                    <h2 className="mp-modal-title">{compactPositionsTitle(listing.positions)}</h2>
                    <div className="mp-modal-fact-columns">
                      <dl className="mp-fact-stack">
                        <div>
                          <Scale size={15} aria-hidden="true" />
                          <dt>В наличии сырья</dt>
                          <dd>{formatWeight(totalWeight)}</dd>
                        </div>
                        <div>
                          <Truck size={15} aria-hidden="true" />
                          <dt>Готовность к отгрузке</dt>
                          <dd>
                            {listing.readyNow ? "Готово сейчас" : formatDateTime(listing.readinessDate).split(",")[0]}
                          </dd>
                        </div>
                        <div>
                          <Package size={15} aria-hidden="true" />
                          <dt>Форма поставки</dt>
                          <dd>{forms || "—"}</dd>
                        </div>
                        {listing.packaging ? (
                          <div>
                            <Layers size={15} aria-hidden="true" />
                            <dt>Упаковка</dt>
                            <dd>{listing.packaging}</dd>
                          </div>
                        ) : null}
                        <div>
                          <CalendarDays size={15} aria-hidden="true" />
                          <dt>Размещено</dt>
                          <dd>{formatDateTime(listing.publishedAt)}</dd>
                        </div>
                      </dl>
                      {productFacts.length > 0 ? (
                        <dl className="mp-modal-spec-grid">
                          {productFacts.map((item) => (
                            <div key={item.label}>
                              <item.icon size={15} aria-hidden="true" />
                              <dt>{item.label}</dt>
                              <dd>{item.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                    </div>
                    <div className="mp-modal-about-inline">
                      <h3>О товаре</h3>
                      {listing.description ? (
                        <p>{listing.description}</p>
                      ) : (
                        <p className="mp-hint">Описание не указано.</p>
                      )}
                    </div>
                  </div>
                </div>

                {!listing.isOwner ? (
                  <div className="mp-modal-columns">
                    <div className="mp-modal-action">
                      {isBuyer && listing.status === "active" ? (
                        <>
                          <MakeOfferForm listing={listing} onSubmitted={() => setRefresh((value) => value + 1)} />
                          <p className="mp-modal-reveal">
                            После отправки предложения ваш телефон станет доступен заготовителю только после его
                            согласия.
                          </p>
                        </>
                      ) : (
                        <p className="mp-hint">
                          {listing.status === "active"
                            ? "Предложения отправляют покупатели — трейдеры и переработчики."
                            : "Объявление сейчас неактивно."}
                        </p>
                      )}

                      {listing.status === "active" ? (
                        <ReportControl
                          entityType="marketplace_listing"
                          entityId={listing.id}
                          label="Пожаловаться на объявление"
                        />
                      ) : null}
                    </div>

                    <aside className="mp-modal-reviews" aria-label="Рейтинг и отзывы продавца">
                      <CompanyReviews companyId={listing.seller.companyId} />
                    </aside>
                  </div>
                ) : null}

                {listing.isOwner ? (
                  <div className="mp-modal-section">
                    <ListingOffersPanel listingId={listing.id} onChanged={() => setRefresh((value) => value + 1)} />
                  </div>
                ) : null}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
