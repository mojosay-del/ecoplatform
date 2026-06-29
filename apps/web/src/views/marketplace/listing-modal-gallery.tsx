"use client";

import { PlayCircle } from "lucide-react";
import type { FileAsset } from "../../lib/api";
import { preferredFileAssetImageUrl, preferredFileAssetMediaUrl } from "../../lib/api";
import { selectedListingModalMedia, type ListingModalMediaItem } from "./listing-modal.helpers";

export function ListingModalGallery({
  activeMedia,
  assets,
  mediaItems,
  onActiveMediaChange,
  onOpenLightbox,
}: {
  activeMedia: number;
  assets: Map<string, FileAsset>;
  mediaItems: ListingModalMediaItem[];
  onActiveMediaChange: (index: number) => void;
  onOpenLightbox: () => void;
}) {
  const { activePhotoUrl, activeVideoUrl, selectedAsset, selectedMedia } = selectedListingModalMedia(
    mediaItems,
    activeMedia,
    assets,
  );

  return (
    <div className="mp-modal-gallery">
      <div className="mp-modal-media-frame">
        {activePhotoUrl ? (
          <button
            aria-label="Открыть фото на весь экран"
            className="mp-modal-photo-button"
            type="button"
            onClick={onOpenLightbox}
          >
            <img className="mp-modal-photo" src={activePhotoUrl} alt="" />
          </button>
        ) : activeVideoUrl ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- пользовательское видео объявления, дорожки субтитров нет
          <video className="mp-modal-video" controls playsInline preload="metadata" src={activeVideoUrl} />
        ) : selectedMedia?.kind === "video" ? (
          <div className="mp-modal-media-empty">{selectedAsset ? "Видео обрабатывается" : "Видео загружается"}</div>
        ) : (
          <div className="mp-modal-media-empty">Нет фото</div>
        )}
      </div>
      {mediaItems.length > 1 ? (
        <div className="mp-modal-thumbs">
          {mediaItems.map((media, index) => {
            const asset = assets.get(media.fileId);
            const thumb =
              media.kind === "video" ? preferredFileAssetMediaUrl(asset) : preferredFileAssetImageUrl(asset);
            return (
              <button
                key={media.id}
                type="button"
                className={`mp-modal-thumb${media.kind === "video" ? " is-video" : ""}${
                  index === activeMedia ? " active" : ""
                }`}
                onClick={() => onActiveMediaChange(index)}
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
  );
}
