"use client";

// Загрузчик фото/видео объявления: сетка плиток с drag&drop сортировкой фото,
// прогресс загрузки и лимиты (LISTING_MAX_PHOTOS/VIDEOS). Загруженные черновые
// файлы регистрируются через onUploaded, чтобы родитель мог их подчистить.

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ImagePlus, Upload, Video, X } from "lucide-react";
import { LISTING_MAX_PHOTOS, LISTING_MAX_VIDEOS, LISTING_MIN_PHOTOS } from "@ecoplatform/shared";
import {
  ApiError,
  apiUploadFileWithProgress,
  preferredFileAssetImageUrl,
  preferredFileAssetMediaUrl,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useFileAssetsByIds } from "../../lib/use-cover-assets";
import { SortableMediaTile } from "./listing-form-fields";
import type { MediaItem, MediaUploadProgress } from "./listing-form.helpers";

export function MediaUploader({
  media,
  onChange,
  onUploaded,
  onRemove,
}: {
  media: MediaItem[];
  onChange: (media: MediaItem[]) => void;
  onUploaded?: (fileId: string) => void;
  onRemove?: (fileId: string) => void;
}) {
  const { token } = useAuth();
  const assets = useFileAssetsByIds(media.map((item) => item.fileId));
  const [uploadProgress, setUploadProgress] = useState<MediaUploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const photoItems = media.filter((item) => item.kind === "photo");
  const videoItems = media.filter((item) => item.kind === "video");
  const photos = photoItems.length;
  const videos = videoItems.length;
  const uploading = uploadProgress !== null;
  const uploadPercent = Math.round((uploadProgress?.fraction ?? 0) * 100);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function mergeMedia(nextPhotos: MediaItem[], nextVideos = videoItems): MediaItem[] {
    return [...nextPhotos, ...nextVideos];
  }

  function removeMediaItem(fileId: string) {
    onRemove?.(fileId);
    onChange(media.filter((item) => item.fileId !== fileId));
  }

  function handlePhotoDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = photoItems.findIndex((item) => item.fileId === String(active.id));
    const to = photoItems.findIndex((item) => item.fileId === String(over.id));
    if (from === -1 || to === -1) return;
    onChange(mergeMedia(arrayMove(photoItems, from, to)));
  }

  async function addFiles(fileList: FileList | null, kind: "photo" | "video") {
    if (!fileList || !token) return;
    const remainingSlots = kind === "photo" ? LISTING_MAX_PHOTOS - photos : LISTING_MAX_VIDEOS - videos;
    const files = Array.from(fileList).slice(0, Math.max(0, remainingSlots));
    if (files.length === 0) return;

    setError(null);
    try {
      const next = [...media];
      for (const [index, file] of files.entries()) {
        const currentPhotos = next.filter((item) => item.kind === "photo").length;
        const currentVideos = next.filter((item) => item.kind === "video").length;
        if (kind === "photo" && currentPhotos >= LISTING_MAX_PHOTOS) break;
        if (kind === "video" && currentVideos >= LISTING_MAX_VIDEOS) break;
        setUploadProgress({ fileName: file.name, fraction: 0, index: index + 1, total: files.length, kind });
        const asset = await apiUploadFileWithProgress(file, {
          token,
          accessLevel: "public",
          onProgress: (fraction) => {
            setUploadProgress({ fileName: file.name, fraction, index: index + 1, total: files.length, kind });
          },
        });
        onUploaded?.(asset.id);
        next.push({ fileId: asset.id, kind });
      }
      onChange(
        mergeMedia(
          next.filter((item) => item.kind === "photo"),
          next.filter((item) => item.kind === "video"),
        ),
      );
    } catch (uploadError) {
      setError(uploadError instanceof ApiError ? uploadError.message : "Не удалось загрузить файл.");
    } finally {
      setUploadProgress(null);
    }
  }

  return (
    <div>
      <div className="mp-media">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handlePhotoDragEnd}>
          <SortableContext items={photoItems.map((item) => item.fileId)} strategy={rectSortingStrategy}>
            <div className="mp-media-photos">
              {photoItems.map((item, index) => (
                <SortableMediaTile
                  key={item.fileId}
                  item={item}
                  index={index}
                  url={preferredFileAssetImageUrl(assets.get(item.fileId))}
                  onRemove={() => removeMediaItem(item.fileId)}
                />
              ))}
              {photos < LISTING_MAX_PHOTOS ? (
                <label className={`mp-media-add${uploading ? " is-disabled" : ""}${photos === 0 ? " is-primary" : ""}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    disabled={uploading}
                    onChange={(event) => addFiles(event.target.files, "photo")}
                  />
                  <ImagePlus size={20} strokeWidth={2.1} aria-hidden="true" />
                  <span>Фото</span>
                </label>
              ) : null}
            </div>
          </SortableContext>
        </DndContext>
        <div className="mp-media-videos">
          {videoItems.map((item) => {
            const url = preferredFileAssetMediaUrl(assets.get(item.fileId));
            return (
              <div className="mp-media-tile mp-video-tile" key={item.fileId}>
                {url ? <video src={url} muted preload="metadata" /> : <div className="mp-media-empty">Видео</div>}
                <button
                  className="mp-media-remove"
                  type="button"
                  aria-label="Удалить видео"
                  onClick={() => removeMediaItem(item.fileId)}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
          {videos < LISTING_MAX_VIDEOS ? (
            <label className={`mp-media-add mp-media-add-video${uploading ? " is-disabled" : ""}`}>
              <input
                type="file"
                accept="video/*"
                hidden
                disabled={uploading}
                onChange={(event) => addFiles(event.target.files, "video")}
              />
              <Video size={20} strokeWidth={2.1} aria-hidden="true" />
              <span>Видео</span>
            </label>
          ) : null}
        </div>
        {uploadProgress ? (
          <div className="mp-media-progress" role="status" aria-live="polite">
            <div className="mp-media-progress-head">
              <Upload size={18} className="mp-media-progress-spin" />
              <span className="mp-media-progress-name">{uploadProgress.fileName}</span>
              <span className="mp-media-progress-percent">
                {uploadPercent >= 100 ? "Сохраняем…" : `${uploadPercent}%`}
              </span>
            </div>
            <div className="mp-media-progress-track">
              <div
                className={`mp-media-progress-fill${uploadPercent >= 100 ? " is-indeterminate" : ""}`}
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <small>
              {uploadProgress.kind === "photo" ? "Фото" : "Видео"} {uploadProgress.index}/{uploadProgress.total}
            </small>
          </div>
        ) : null}
      </div>
      <p className="mp-hint">
        Фото: {photos}/{LISTING_MAX_PHOTOS} (минимум {LISTING_MIN_PHOTOS} для публикации). Видео: {videos}/
        {LISTING_MAX_VIDEOS}.
      </p>
      {error ? <p className="mp-error">{error}</p> : null}
    </div>
  );
}
