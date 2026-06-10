"use client";

// Детальная карточка объявления: галерея, позиции, характеристики. Владельцу
// видны телефон/адрес и действия (редактировать / опубликовать / снять /
// переподать); остальным — карточка со скрытыми контактами (до акцепта, фаза 3).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { ApiError, api, preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { AuthRequired, ErrorState, useApiQuery } from "../shared";
import { LISTING_FORM_LABEL, ListingStatusBadge, formatWeight } from "./listing-ui";
import { CompanyReviews } from "./CompanyReviews";
import { ListingOffersPanel } from "./ListingOffersPanel";
import { MakeOfferForm } from "./MakeOfferForm";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ru-RU") : "—";
}

export function ListingDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const { data, setData, state, errorMessage } = useApiQuery(
    `marketplace-listing-${id}-${refresh}`,
    () => api.marketplace.get(id),
    null as MarketplaceListingDetail | null,
  );

  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const mediaIds = (data?.media ?? []).map((item) => item.fileId);
  const assets = useFileAssetsByIds(mediaIds);

  if (state === "unauthenticated") {
    return <AuthRequired title="Объявление" />;
  }
  if (state === "error" || (state === "ready" && !data)) {
    return <ErrorState title="Объявление" message={errorMessage ?? "Объявление не найдено."} />;
  }
  if (state === "loading" || !data) {
    return (
      <AppShell>
        <section className="page">
          <p className="page-subtitle" style={{ textAlign: "center", padding: "60px 0" }}>
            Загрузка…
          </p>
        </section>
      </AppShell>
    );
  }

  const listing = data;
  const isBuyer = user?.company?.type === "trader" || user?.company?.type === "processor";
  const photos = listing.media.filter((item) => item.kind === "photo");
  const videos = listing.media.filter((item) => item.kind === "video");

  async function runAction(action: () => Promise<MarketplaceListingDetail>) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await action());
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : "Не удалось выполнить действие.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <section className="page">
        <Link className="button ghost" href="/marketplace" style={{ marginBottom: 16, alignSelf: "flex-start" }}>
          ← К ленте
        </Link>
        <header className="page-header" style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <h1 className="page-title" style={{ margin: 0 }}>
            {listing.positions.map((position) => position.nomenclatureName).join(", ") || "Объявление"}
          </h1>
          <ListingStatusBadge status={listing.status} />
        </header>

        <div className="mp-detail">
          <div>
            {photos.length > 0 ? (
              <div className="mp-gallery">
                {photos.map((photo, index) => {
                  const url = preferredFileAssetImageUrl(assets.get(photo.fileId));
                  return url ? (
                    <img
                      key={photo.id}
                      className={index === 0 ? "mp-gallery-main" : undefined}
                      src={url}
                      alt=""
                    />
                  ) : null;
                })}
              </div>
            ) : (
              <p className="mp-hint">Без фотографий.</p>
            )}

            {videos.length > 0 ? (
              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {videos.map((video) => {
                  const url = preferredFileAssetMediaUrl(assets.get(video.fileId));
                  return url ? (
                    <video key={video.id} controls preload="metadata" src={url} style={{ width: "100%", borderRadius: 10 }} />
                  ) : null;
                })}
              </div>
            ) : null}

            <table className="mp-positions-table" style={{ marginTop: 20 }}>
              <thead>
                <tr>
                  <th>Сырьё</th>
                  <th>Вес</th>
                  <th>Форма</th>
                  <th>Влажность</th>
                  <th>Засор</th>
                </tr>
              </thead>
              <tbody>
                {listing.positions.map((position) => (
                  <tr key={position.id}>
                    <td>{position.nomenclatureName}</td>
                    <td>{formatWeight(position.weightKg)}</td>
                    <td>{LISTING_FORM_LABEL[position.form] ?? position.form}</td>
                    <td>{position.moisturePct == null ? "—" : `${position.moisturePct}%`}</td>
                    <td>{position.contaminationPct == null ? "—" : `${position.contaminationPct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {listing.description ? <p style={{ marginTop: 16 }}>{listing.description}</p> : null}
          </div>

          <aside className="mp-detail-side">
            <div>
              <div className="mp-fact">
                <span className="mp-fact-label">Местоположение</span>
                <span>
                  {listing.city}
                  {listing.region && listing.region !== listing.city ? `, ${listing.region}` : ""}
                </span>
              </div>
              <div className="mp-fact">
                <span className="mp-fact-label">Готовность</span>
                <span>{listing.readyNow ? "Готово сейчас" : formatDate(listing.readinessDate)}</span>
              </div>
              {listing.status === "active" ? (
                <div className="mp-fact">
                  <span className="mp-fact-label">Активно до</span>
                  <span>{formatDate(listing.expiresAt)}</span>
                </div>
              ) : null}
              {listing.packaging ? (
                <div className="mp-fact">
                  <span className="mp-fact-label">Упаковка</span>
                  <span>{listing.packaging}</span>
                </div>
              ) : null}
              {listing.paymentTerms ? (
                <div className="mp-fact">
                  <span className="mp-fact-label">Оплата</span>
                  <span>{listing.paymentTerms}</span>
                </div>
              ) : null}
            </div>

            {listing.contactPhone ? (
              <div>
                <div className="mp-fact">
                  <span className="mp-fact-label">Телефон</span>
                  <span>{listing.contactPhone}</span>
                </div>
                {listing.address?.formatted ? (
                  <div className="mp-fact">
                    <span className="mp-fact-label">Адрес</span>
                    <span>{listing.address.formatted}</span>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="mp-hidden-contact">
                Точный адрес и контакты продавца раскрываются после принятия предложения.
              </p>
            )}

            {listing.isOwner ? (
              <div className="mp-row-actions" style={{ justifyContent: "flex-start" }}>
                {listing.status !== "archived" ? (
                  <Link className="button secondary" href={`/marketplace/${listing.id}/edit`}>
                    Редактировать
                  </Link>
                ) : null}
                {listing.status === "draft" ? (
                  <button className="button" disabled={busy} onClick={() => runAction(() => api.marketplace.publish(listing.id))} type="button">
                    Опубликовать
                  </button>
                ) : null}
                {listing.status !== "archived" ? (
                  <button className="button secondary" disabled={busy} onClick={() => runAction(() => api.marketplace.archive(listing.id))} type="button">
                    Снять
                  </button>
                ) : (
                  <button
                    className="button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      setActionError(null);
                      try {
                        const created = await api.marketplace.republish(listing.id);
                        router.push(`/marketplace/${created.id}/edit`);
                      } catch (error) {
                        setActionError(error instanceof ApiError ? error.message : "Не удалось переподать.");
                        setBusy(false);
                      }
                    }}
                    type="button"
                  >
                    Переподать
                  </button>
                )}
              </div>
            ) : null}
            {actionError ? <p className="mp-error">{actionError}</p> : null}
          </aside>
        </div>

        {listing.isOwner ? (
          <div style={{ marginTop: 28 }}>
            <ListingOffersPanel listingId={listing.id} onChanged={() => setRefresh((value) => value + 1)} />
          </div>
        ) : null}
        {!listing.isOwner && isBuyer && listing.status === "active" ? (
          <div style={{ marginTop: 28 }}>
            <MakeOfferForm listing={listing} onSubmitted={() => undefined} />
          </div>
        ) : null}

        <div style={{ marginTop: 28 }}>
          <CompanyReviews companyId={listing.seller.companyId} />
        </div>
      </section>
    </AppShell>
  );
}
