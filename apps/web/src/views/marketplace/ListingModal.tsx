"use client";

// Просмотр объявления — модальное окно (по макету владельца, в стиле Ecoplatform):
// шапка с продавцом/рейтингом/городом, галерея, характеристики, «О товаре» и
// колонка действий для покупателя. Открывается из
// ленты по клику на карточку или объект карты; та же модалка — за deep-link
// /marketplace/[id]. Цену продавец не ставит (закрытый аукцион), мини-карты нет.

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  CreditCard,
  Droplets,
  Filter,
  Handshake,
  Layers,
  Mail,
  MapPin,
  Package,
  PlayCircle,
  Scale,
  Star,
  Truck,
  UserRound,
  Weight,
  X,
  type LucideIcon,
} from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { api, preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { invalidateQueryFamilies, queryKeys } from "../../lib/query";
import { pluralizeRu } from "../../lib/ru-plural";
import { useDialogA11y } from "../../lib/use-dialog-a11y";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useApiQuery } from "../shared";
import { CompanyReviews } from "./CompanyReviews";
import { ListingOffersPanel } from "./ListingOffersPanel";
import { contaminationLabel, moistureLabel } from "./listing-characteristics";
import { expiryLabel, isExpiringSoon, memberSinceLabel } from "./listing-card-meta";
import { compactPositionsTitle } from "./listing-title";
import { LISTING_FORM_LABEL, ListingStatusBadge, formatLocation, formatWeight } from "./listing-ui";
import { MakeOfferForm } from "./MakeOfferForm";
import { MediaLightbox } from "./MediaLightbox";
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

export function ListingModal({
  listingId,
  onClose,
  onChanged,
}: {
  listingId: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, state, errorMessage } = useApiQuery(
    queryKeys.marketplace.detail(listingId),
    () => api.marketplace.get(listingId),
    null as MarketplaceListingDetail | null,
  );
  const [activeMedia, setActiveMedia] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Якорь колонки действий — мобильная CTA-полоса прокручивает к форме ставки.
  const actionRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const assets = useFileAssetsByIds((data?.media ?? []).map((item) => item.fileId));

  useDialogA11y(modalRef, { bodyLock: true });

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // Слои закрытия единым обработчиком: сначала лайтбокс, потом модалка.
      if (lightboxOpen) {
        setLightboxOpen(false);
      } else {
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, lightboxOpen]);

  useEffect(() => {
    setActiveMedia(0);
    setLightboxOpen(false);
  }, [listingId]);

  function handleListingChanged() {
    void invalidateQueryFamilies(queryClient, ["marketplace"]);
    onChanged?.();
  }

  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";

  return (
    <div
      className={`mp-modal-backdrop${lightboxOpen ? " is-locked" : ""}`}
      role="dialog"
      aria-label="Объявление"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="mp-modal" onClick={(event) => event.stopPropagation()} ref={modalRef}>
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
            const moisture = moistureLabel(listing.positions.find((position) => position.moistureCondition));
            const contamination = contaminationLabel(
              listing.positions.find((position) => position.contaminationCondition),
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
                        <UserRound size={22} aria-hidden="true" />
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
                        {/* Блок доверия: сделки и стаж на площадке (фаза 8 API). */}
                        {listing.seller.dealsCompleted > 0 ? (
                          <span className="mp-modal-deals">
                            <Handshake size={13} aria-hidden="true" /> {listing.seller.dealsCompleted}{" "}
                            {pluralizeRu(listing.seller.dealsCompleted, "сделка", "сделки", "сделок")}
                          </span>
                        ) : null}
                        {memberSinceLabel(listing.seller.memberSince) ? (
                          <span className="mp-modal-member-since">
                            На площадке {memberSinceLabel(listing.seller.memberSince)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="mp-modal-header-badges">
                    {/* Главная механика площадки названа прямо в шапке. */}
                    <span className="mp-auction-badge">
                      <Mail aria-hidden="true" size={13} />
                      Закрытый аукцион
                    </span>
                    {isExpiringSoon(listing.expiresAt) ? (
                      <span className="mp-expiry-badge">{expiryLabel(listing.expiresAt)}</span>
                    ) : null}
                    <ListingStatusBadge status={listing.status} />
                  </div>
                </div>

                <div className="mp-modal-main">
                  <div className="mp-modal-gallery">
                    <div className="mp-modal-media-frame">
                      {activePhotoUrl ? (
                        <button
                          aria-label="Открыть фото на весь экран"
                          className="mp-modal-photo-button"
                          type="button"
                          onClick={() => setLightboxOpen(true)}
                        >
                          <img className="mp-modal-photo" src={activePhotoUrl} alt="" />
                        </button>
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
                    <div className="mp-modal-action" ref={actionRef}>
                      {/* Соц-доказательство без раскрытия цен: только количество. */}
                      <p className="mp-auction-count">
                        <Mail aria-hidden="true" size={14} />
                        {listing.offerCount > 0
                          ? `Подано ${listing.offerCount} ${pluralizeRu(listing.offerCount, "предложение", "предложения", "предложений")}`
                          : isBuyer && listing.status === "active"
                            ? "Предложений пока нет — будьте первым"
                            : "Предложений пока нет"}
                      </p>
                      {isBuyer && listing.status === "active" ? (
                        <>
                          <MakeOfferForm listing={listing} onSubmitted={handleListingChanged} />
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

                      <details className="mp-auction-explainer">
                        <summary>Как работает закрытый аукцион</summary>
                        <ul>
                          <li>Ставки других покупателей скрыты — каждый предлагает свою цену вслепую.</li>
                          <li>Продавец видит цены без названий компаний и выбирает лучшее предложение.</li>
                          <li>Контакты сторон раскрываются только после принятия предложения.</li>
                        </ul>
                      </details>

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
                    <ListingOffersPanel listingId={listing.id} onChanged={handleListingChanged} />
                  </div>
                ) : null}

                {/* Мобильная CTA-полоса: прокручивает к форме ставки (≤760px). */}
                {!listing.isOwner && isBuyer && listing.status === "active" ? (
                  <div className="mp-modal-cta-bar">
                    <button
                      className="button"
                      type="button"
                      onClick={() => actionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      Сделать предложение
                    </button>
                  </div>
                ) : null}

                {lightboxOpen ? (
                  <MediaLightbox
                    index={activeMedia}
                    items={mediaItems.map((media) => {
                      const asset = assets.get(media.fileId);
                      return {
                        id: media.id,
                        kind: media.kind,
                        url:
                          media.kind === "video"
                            ? preferredFileAssetMediaUrl(asset)
                            : preferredFileAssetImageUrl(asset),
                      };
                    })}
                    onClose={() => setLightboxOpen(false)}
                    onIndexChange={setActiveMedia}
                  />
                ) : null}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
