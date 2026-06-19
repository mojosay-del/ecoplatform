"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { FileText, RefreshCcw, Upload, X } from "lucide-react";
import "./file-upload.css";
import {
  apiDeleteFile,
  apiFetch,
  apiUploadFileWithProgress,
  preferredFileAssetImageUrl,
  type FileAsset,
} from "../lib/api";
import { useAuth } from "../lib/auth";

// Показываем миниатюру для image-MIME и для любого file, у которого
// publicUrl уже выставлен и расширение похоже на изображение.
function isImageAsset(asset: FileAsset | null): boolean {
  if (!asset) return false;
  if (asset.mimeType?.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(asset.originalName ?? "");
}

export function FileUploadField({
  value,
  accept,
  label = "Файл",
  buttonLabel = "Загрузить",
  accessLevel = "public",
  imagePreset,
  onChange,
  hideLabel,
  compact,
  tile,
}: {
  value: string;
  accept?: string;
  label?: string;
  buttonLabel?: string;
  accessLevel?: FileAsset["accessLevel"];
  imagePreset?: "cover";
  onChange: (fileId: string, asset?: FileAsset) => void;
  hideLabel?: boolean;
  compact?: boolean;
  tile?: boolean;
}) {
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<FileAsset | null>(null);
  // progress: null — не грузим; 0..1 — доля отправленных байт.
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadingName, setUploadingName] = useState("");
  const [dragActive, setDragActive] = useState(false);

  // При открытии формы редактирования у нас уже есть value (id файла), но
  // нет asset. Подтягиваем мету по id, чтобы сразу нарисовать миниатюру —
  // пользователь не должен видеть «голый» id из БД.
  useEffect(() => {
    let cancelled = false;
    if (!value || !token) {
      setUploaded(null);
      return;
    }
    if (uploaded?.id === value) {
      return;
    }
    apiFetch<FileAsset[]>(`/files?ids=${encodeURIComponent(value)}`, { token })
      .then((result) => {
        if (cancelled) return;
        setUploaded(result[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setUploaded(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value, token, uploaded?.id]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      uploadAbortRef.current?.abort();
    };
  }, []);

  async function upload(file: File | undefined) {
    if (!file || !token) {
      return;
    }

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;
    setError(null);
    setUploadingName(file.name);
    setProgress(0);
    try {
      const asset = await apiUploadFileWithProgress(file, {
        token,
        accessLevel,
        imagePreset,
        signal: controller.signal,
        onProgress: (fraction) => {
          if (mountedRef.current && uploadAbortRef.current === controller) {
            setProgress(fraction);
          }
        },
      });
      if (!mountedRef.current || uploadAbortRef.current !== controller) return;
      setUploaded(asset);
      onChange(asset.id, asset);
    } catch (uploadError) {
      if (!controller.signal.aborted) {
        setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить файл.");
      }
    } finally {
      if (uploadAbortRef.current === controller) {
        uploadAbortRef.current = null;
        if (mountedRef.current) {
          setProgress(null);
          setUploadingName("");
          if (inputRef.current) {
            inputRef.current.value = "";
          }
        }
      }
    }
  }

  async function clear() {
    const fileId = uploaded?.id;
    setUploaded(null);
    setError(null);
    onChange("");

    if (!fileId || !token) {
      return;
    }

    try {
      await apiDeleteFile(fileId, { token });
    } catch {
      setError("Файл отвязан, но удалить его из хранилища не удалось.");
    }
  }

  function pick() {
    inputRef.current?.click();
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    if (progress !== null) return;
    void upload(event.dataTransfer.files?.[0]);
  }
  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (progress === null) setDragActive(true);
  }
  function onDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  const imageMode = isImageAsset(uploaded);
  const uploadedImageUrl = preferredFileAssetImageUrl(uploaded);
  const hasFile = Boolean(uploaded);
  const uploading = progress !== null;
  const percent = Math.round((progress ?? 0) * 100);

  const hiddenInput = (
    <input
      accept={accept}
      hidden
      onChange={(event) => void upload(event.target.files?.[0])}
      ref={inputRef}
      type="file"
    />
  );

  const progressView = (
    <div className="file-upload-progress" role="status" aria-live="polite">
      <div className="file-upload-progress-head">
        <Upload size={tile ? 16 : 18} className="file-upload-progress-spin" />
        <span className="file-upload-progress-name">{uploadingName || "Загрузка…"}</span>
        <span className="file-upload-progress-percent">{percent >= 100 ? "Обработка…" : `${percent}%`}</span>
      </div>
      <div className="file-upload-progress-track">
        <div
          className={`file-upload-progress-fill${percent >= 100 ? " is-indeterminate" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );

  if (tile) {
    return (
      <div className={`file-upload-field is-tile${dragActive ? " is-drag" : ""}`}>
        {hideLabel ? null : <span className="file-upload-label">{label}</span>}
        {hiddenInput}
        {uploading ? (
          <div className="file-upload-tile-uploading">{progressView}</div>
        ) : hasFile ? (
          imageMode && uploadedImageUrl ? (
            <div className="file-upload-tile-preview">
              <img alt={uploaded?.originalName ?? "Файл"} src={uploadedImageUrl} />
              <div className="file-upload-tile-actions">
                <button onClick={pick} type="button" aria-label="Заменить файл" title="Заменить">
                  <RefreshCcw size={15} />
                </button>
                <button onClick={() => void clear()} type="button" aria-label="Убрать файл" title="Убрать">
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div className="file-upload-tile-file">
              <FileText size={18} />
              <strong>{uploaded?.originalName ?? "Файл прикреплён"}</strong>
              <div className="file-upload-tile-actions">
                <button onClick={pick} type="button" aria-label="Заменить файл" title="Заменить">
                  <RefreshCcw size={15} />
                </button>
                <button onClick={() => void clear()} type="button" aria-label="Убрать файл" title="Убрать">
                  <X size={15} />
                </button>
              </div>
            </div>
          )
        ) : (
          <button
            className={`file-upload-tile-empty${dragActive ? " is-drag" : ""}`}
            onClick={pick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            type="button"
          >
            <Upload size={18} />
            <span>{buttonLabel}</span>
          </button>
        )}
        {error ? <p className="file-upload-error">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={`file-upload-field${compact ? " is-compact" : ""}${dragActive ? " is-drag" : ""}`}>
      {hideLabel ? null : <span className="file-upload-label">{label}</span>}
      {hiddenInput}
      {uploading ? (
        <div className="file-upload-card">{progressView}</div>
      ) : hasFile ? (
        imageMode && uploadedImageUrl ? (
          <div className="file-upload-preview">
            <img alt={uploaded?.originalName ?? "Файл"} src={uploadedImageUrl} />
            <div className="file-upload-preview-actions">
              <button className="button secondary" onClick={pick} type="button">
                <RefreshCcw size={16} />
                Заменить
              </button>
              <button className="button secondary" onClick={() => void clear()} type="button">
                <X size={16} />
                Убрать
              </button>
            </div>
          </div>
        ) : (
          <div className="file-upload-chip">
            <span className="file-upload-chip-icon">
              <FileText size={18} />
            </span>
            <strong className="file-upload-chip-name">{uploaded?.originalName ?? "Файл прикреплён"}</strong>
            {(uploaded?.publicUrl ?? uploaded?.downloadUrl) ? (
              <a
                className="file-upload-chip-link"
                href={(uploaded?.publicUrl ?? uploaded?.downloadUrl) as string}
                rel="noreferrer"
                target="_blank"
              >
                Открыть
              </a>
            ) : null}
            <div className="file-upload-chip-actions">
              <button className="button secondary" onClick={pick} type="button">
                <RefreshCcw size={16} />
                Заменить
              </button>
              <button className="button secondary" onClick={() => void clear()} type="button">
                <X size={16} />
                Убрать
              </button>
            </div>
          </div>
        )
      ) : (
        <button
          className={`file-upload-dropzone${dragActive ? " is-drag" : ""}${compact ? " is-compact" : ""}`}
          onClick={pick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          type="button"
        >
          <span className="file-upload-dropzone-icon">
            <Upload size={compact ? 18 : 22} />
          </span>
          <span className="file-upload-dropzone-text">
            <strong>{buttonLabel}</strong>
            {compact ? null : <small>или перетащите файл сюда</small>}
          </span>
        </button>
      )}
      {error ? <p className="file-upload-error">{error}</p> : null}
    </div>
  );
}
