"use client";

// Просмотр объявления — модальное окно (по макету владельца, в стиле Ecoplatform):
// шапка с продавцом/рейтингом/городом, галерея, характеристики, «О товаре» и
// колонка действий (предложение покупателя / действия владельца). Открывается из
// ленты по клику на карточку или круг/булавку карты; та же модалка — за deep-link
// /marketplace/[id]. Цену продавец не ставит (закрытый аукцион), мини-карты нет.

import Link from "next/link";
import { useEffect, useState } from "react";
import { BadgeCheck, MapPin, Package, Recycle, Scale, Star, Truck, X } from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { ApiError, api, preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useApiQuery } from "../shared";
import { CompanyReviews } from "./CompanyReviews";
import { ListingOffersPanel } from "./ListingOffersPanel";
import { LISTING_FORM_LABEL, ListingStatusBadge, formatWeight } from "./listing-ui";
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
  const [refresh, setRefresh] = useState(0);
  const { data, setData, state, errorMessage } = useApiQuery(
    `marketplace-listing-${listingId}-${refresh}`,
    () => api.marketplace.get(listingId),
    null as MarketplaceListingDetail | null,
  );
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);

  const assets = useFileAssetsByIds((data?.media ?? []).map((item) => item.fileId));

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function runAction(action: () => Promise<MarketplaceListingDetail>) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await action());
      onChanged?.();
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

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
            const photos = listing.media.filter((item) => item.kind === "photo");
            const videos = listing.media.filter((item) => item.kind === "video");
            const activeUrl = preferredFileAssetImageUrl(assets.get(photos[activePhoto]?.fileId ?? ""));
            const totalWeight = listing.positions.reduce((sum, position) => sum + position.weightKg, 0);
            const forms = [...new Set(listing.positions.map((position) => LISTING_FORM_LABEL[position.form] ?? position.form))].join(", ");
            const firstMoisture = listing.positions.find((position) => position.moisturePct != null)?.moisturePct ?? null;
            const firstContamination = listing.positions.find((position) => position.contaminationPct != null)?.contaminationPct ?? null;
            const location =
              listing.region && listing.region !== listing.city ? `${listing.city}, ${listing.region}` : listing.city;

            return (
              <>
                <div className="mp-modal-header">
                  <div className="mp-modal-seller">
                    <span className="mp-modal-avatar">
                      <Recycle size={22} aria-hidden="true" />
                    </span>
                    <div>
                      <div className="mp-modal-seller-name">
                        {listing.seller.name}
                        <BadgeCheck className="mp-modal-verified" size={16} aria-label="Зарегистрированная компания" />
                      </div>
                      <div className="mp-modal-seller-meta">
                        <MapPin size={13} aria-hidden="true" /> {location}
                        {listing.seller.rating != null ? (
                          <span className="mp-modal-rating">
                            <Star size={13} aria-hidden="true" /> {listing.seller.rating.toFixed(1)}
                          </span>
                        ) : (
                          <span className="mp-modal-rating mp-modal-rating-empty">Нет отзывов</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ListingStatusBadge status={listing.status} />
                </div>

                <div className="mp-modal-main">
                  <div className="mp-modal-gallery">
                    {activeUrl ? (
                      <img className="mp-modal-photo" src={activeUrl} alt="" />
                    ) : (
                      <div className="mp-card-cover-empty mp-modal-photo">Нет фото</div>
                    )}
                    {photos.length > 1 ? (
                      <div className="mp-modal-thumbs">
                        {photos.map((photo, index) => {
                          const thumb = preferredFileAssetImageUrl(assets.get(photo.fileId));
                          return (
                            <button
                              key={photo.id}
                              type="button"
                              className={`mp-modal-thumb ${index === activePhoto ? "active" : ""}`}
                              onClick={() => setActivePhoto(index)}
                              aria-label={`Фото ${index + 1}`}
                            >
                              {thumb ? <img src={thumb} alt="" /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  <div className="mp-modal-facts">
                    <h2 className="mp-modal-title">
                      {listing.positions.map((position) => position.nomenclatureName).join(", ") || "Объявление"}
                    </h2>
                    <div className="mp-modal-pills">
                      {listing.positions.map((position) => (
                        <span className="mp-modal-pill" key={position.id}>
                          {position.nomenclatureName} · {formatWeight(position.weightKg)}
                        </span>
                      ))}
                    </div>
                    <dl className="mp-fact-grid">
                      <div>
                        <Scale size={15} aria-hidden="true" />
                        <dt>Доступно сейчас</dt>
                        <dd>{formatWeight(totalWeight)}</dd>
                      </div>
                      {listing.typicalLoadKg != null ? (
                        <div>
                          <Truck size={15} aria-hidden="true" />
                          <dt>Обычно гружу в машину</dt>
                          <dd>{tons(listing.typicalLoadKg)}</dd>
                        </div>
                      ) : null}
                      <div>
                        <Package size={15} aria-hidden="true" />
                        <dt>Форма поставки</dt>
                        <dd>{forms || "—"}</dd>
                      </div>
                      {listing.loadingConditions ? (
                        <div>
                          <Truck size={15} aria-hidden="true" />
                          <dt>Условия погрузки</dt>
                          <dd>{listing.loadingConditions}</dd>
                        </div>
                      ) : null}
                      <div>
                        <MapPin size={15} aria-hidden="true" />
                        <dt>Готовность</dt>
                        <dd>{listing.readyNow ? "Готово сейчас" : formatDateTime(listing.readinessDate).split(",")[0]}</dd>
                      </div>
                    </dl>
                    <p className="mp-modal-meta">Размещено {formatDateTime(listing.publishedAt)}</p>
                  </div>
                </div>

                {videos.length > 0 ? (
                  <div className="mp-modal-videos">
                    {videos.map((video) => {
                      const url = preferredFileAssetMediaUrl(assets.get(video.fileId));
                      return url ? <video key={video.id} controls preload="metadata" src={url} /> : null;
                    })}
                  </div>
                ) : null}

                <div className="mp-modal-columns">
                  <div className="mp-modal-about">
                    <h3>О товаре</h3>
                    {listing.description ? <p>{listing.description}</p> : null}
                    <ul className="mp-spec-list">
                      {listing.color ? (
                        <li>
                          <span>Цвет / сорт</span>
                          <span>{listing.color}</span>
                        </li>
                      ) : null}
                      {firstMoisture != null ? (
                        <li>
                          <span>Влажность</span>
                          <span>до {firstMoisture}%</span>
                        </li>
                      ) : null}
                      {firstContamination != null ? (
                        <li>
                          <span>Засор</span>
                          <span>до {firstContamination}%</span>
                        </li>
                      ) : null}
                      {listing.packaging ? (
                        <li>
                          <span>Упаковка</span>
                          <span>{listing.packaging}</span>
                        </li>
                      ) : null}
                      {listing.paymentTerms ? (
                        <li>
                          <span>Оплата</span>
                          <span>{listing.paymentTerms}</span>
                        </li>
                      ) : null}
                    </ul>
                    {listing.contactPhone ? (
                      <div className="mp-modal-contacts">
                        <strong>Контакты продавца</strong>
                        <p>Телефон: {listing.contactPhone}</p>
                        {listing.address?.formatted ? <p>Адрес: {listing.address.formatted}</p> : null}
                      </div>
                    ) : (
                      <p className="mp-hint">Точный адрес и телефон раскрываются после принятия предложения.</p>
                    )}
                  </div>

                  <div className="mp-modal-action">
                    {listing.isOwner ? (
                      <div className="mp-owner-panel">
                        <h3>Управление</h3>
                        <div className="mp-row-actions" style={{ justifyContent: "flex-start" }}>
                          {listing.status !== "archived" ? (
                            <Link className="button secondary" href={`/marketplace/${listing.id}/edit`}>
                              Редактировать
                            </Link>
                          ) : null}
                          {listing.status === "draft" ? (
                            <button
                              className="button"
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(() => api.marketplace.publish(listing.id))}
                            >
                              Опубликовать
                            </button>
                          ) : null}
                          {listing.status !== "archived" ? (
                            <button
                              className="button secondary"
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(() => api.marketplace.archive(listing.id))}
                            >
                              Снять
                            </button>
                          ) : (
                            <button
                              className="button"
                              type="button"
                              disabled={busy}
                              onClick={() => runAction(() => api.marketplace.republish(listing.id))}
                            >
                              Переподать
                            </button>
                          )}
                        </div>
                        {actionError ? <p className="mp-error">{actionError}</p> : null}
                      </div>
                    ) : isBuyer && listing.status === "active" ? (
                      <>
                        <MakeOfferForm listing={listing} onSubmitted={() => setRefresh((value) => value + 1)} />
                        <p className="mp-modal-reveal">
                          После отправки предложения ваш телефон станет доступен заготовителю только после его согласия.
                        </p>
                      </>
                    ) : (
                      <p className="mp-hint">
                        {listing.status === "active"
                          ? "Предложения отправляют покупатели — трейдеры и переработчики."
                          : "Объявление сейчас неактивно."}
                      </p>
                    )}

                    {!listing.isOwner && listing.status === "active" ? (
                      <ReportControl entityType="marketplace_listing" entityId={listing.id} label="Пожаловаться на объявление" />
                    ) : null}
                  </div>
                </div>

                {listing.isOwner ? (
                  <div className="mp-modal-section">
                    <ListingOffersPanel listingId={listing.id} onChanged={() => setRefresh((value) => value + 1)} />
                  </div>
                ) : null}

                <div className="mp-modal-section">
                  <CompanyReviews companyId={listing.seller.companyId} />
                </div>
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}
