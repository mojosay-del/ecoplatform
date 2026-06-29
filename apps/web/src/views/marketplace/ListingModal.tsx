"use client";

// Просмотр объявления — модальное окно (по макету владельца, в стиле Ecoplatform):
// шапка с продавцом/рейтингом/городом, галерея, характеристики, «О товаре» и
// колонка действий для покупателя. Открывается из
// ленты по клику на карточку или объект карты; та же модалка — за deep-link
// /marketplace/[id]. Цену продавец не ставит (закрытый аукцион), мини-карты нет.

import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { MarketplaceListingDetail } from "@ecoplatform/shared";
import { api, type FileAsset } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { invalidateQueryFamilies, queryKeys } from "../../lib/query";
import { useDialogA11y } from "../../lib/use-dialog-a11y";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { useApiQuery } from "../shared";
import { ListingModalActions } from "./listing-modal-actions";
import { ListingModalGallery } from "./listing-modal-gallery";
import { ListingModalHeader } from "./listing-modal-header";
import { listingModalLightboxItems, listingModalMediaItems } from "./listing-modal.helpers";
import { ListingModalInfo } from "./listing-modal-info";
import { MediaLightbox } from "./MediaLightbox";

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
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- клик по фону закрывает; с клавиатуры — кнопка закрытия и Escape
    <div
      className={`mp-modal-backdrop${lightboxOpen ? " is-locked" : ""}`}
      role="dialog"
      aria-label="Объявление"
      aria-modal="true"
      onClick={onClose}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- onClick гасит всплытие, чтобы клик по содержимому не закрывал окно; клавиатура не требуется */}
      <div className="mp-modal" onClick={(event) => event.stopPropagation()} ref={modalRef}>
        <button className="mp-modal-close" type="button" aria-label="Закрыть" onClick={onClose}>
          <X size={20} />
        </button>

        {!data ? (
          <p className="page-subtitle u-text-center u-py-80">
            {state === "error" ? (errorMessage ?? "Объявление не найдено.") : "Загрузка…"}
          </p>
        ) : (
          <ListingModalContent
            activeMedia={activeMedia}
            actionRef={actionRef}
            assets={assets}
            isBuyer={isBuyer}
            lightboxOpen={lightboxOpen}
            listing={data}
            onActiveMediaChange={setActiveMedia}
            onCloseLightbox={() => setLightboxOpen(false)}
            onListingChanged={handleListingChanged}
            onOpenLightbox={() => setLightboxOpen(true)}
          />
        )}
      </div>
    </div>
  );
}

function ListingModalContent({
  activeMedia,
  actionRef,
  assets,
  isBuyer,
  lightboxOpen,
  listing,
  onActiveMediaChange,
  onCloseLightbox,
  onListingChanged,
  onOpenLightbox,
}: {
  activeMedia: number;
  actionRef: RefObject<HTMLDivElement | null>;
  assets: Map<string, FileAsset>;
  isBuyer: boolean;
  lightboxOpen: boolean;
  listing: MarketplaceListingDetail;
  onActiveMediaChange: (index: number) => void;
  onCloseLightbox: () => void;
  onListingChanged: () => void;
  onOpenLightbox: () => void;
}) {
  const mediaItems = listingModalMediaItems(listing);

  return (
    <>
      <ListingModalHeader listing={listing} />
      <div className="mp-modal-main">
        <ListingModalGallery
          activeMedia={activeMedia}
          assets={assets}
          mediaItems={mediaItems}
          onActiveMediaChange={onActiveMediaChange}
          onOpenLightbox={onOpenLightbox}
        />
        <ListingModalInfo listing={listing} />
      </div>
      <ListingModalActions
        actionRef={actionRef}
        isBuyer={isBuyer}
        listing={listing}
        onListingChanged={onListingChanged}
      />
      {lightboxOpen ? (
        <MediaLightbox
          index={activeMedia}
          items={listingModalLightboxItems(mediaItems, assets)}
          onClose={onCloseLightbox}
          onIndexChange={onActiveMediaChange}
        />
      ) : null}
    </>
  );
}
