"use client";

import { useEffect, useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { apiDeleteFile, apiFetch, apiUploadFile, type FileAsset } from "../lib/api";
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
  const [status, setStatus] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<FileAsset | null>(null);

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

  async function upload(file: File | undefined) {
    if (!file || !token) {
      return;
    }

    setStatus("Загружаю…");
    try {
      const asset = await apiUploadFile(file, { token, accessLevel, imagePreset });
      setUploaded(asset);
      onChange(asset.id, asset);
      setStatus(null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось загрузить файл.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  async function clear() {
    const fileId = uploaded?.id;
    setUploaded(null);
    setStatus(null);
    onChange("");

    if (!fileId || !token) {
      return;
    }

    try {
      await apiDeleteFile(fileId, { token });
    } catch {
      setStatus("Файл отвязан, но удалить его из хранилища не удалось.");
    }
  }

  const imageMode = isImageAsset(uploaded);
  const hasFile = Boolean(uploaded);

  if (tile) {
    return (
      <div className="file-upload-field is-tile">
        {hideLabel ? null : <span className="file-upload-label">{label}</span>}
        <input
          accept={accept}
          hidden
          onChange={(event) => void upload(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
        {hasFile ? (
          imageMode && uploaded?.publicUrl ? (
            <div className="file-upload-tile-preview">
              <img alt={uploaded.originalName} src={uploaded.publicUrl} />
              <div className="file-upload-tile-actions">
                <button onClick={() => inputRef.current?.click()} type="button" aria-label="Заменить файл">
                  <Upload size={15} />
                </button>
                <button onClick={() => void clear()} type="button" aria-label="Убрать файл">
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div className="file-upload-tile-file">
              <strong>{uploaded?.originalName ?? "Файл прикреплён"}</strong>
              <div className="file-upload-tile-actions">
                <button onClick={() => inputRef.current?.click()} type="button" aria-label="Заменить файл">
                  <Upload size={15} />
                </button>
                <button onClick={() => void clear()} type="button" aria-label="Убрать файл">
                  <X size={15} />
                </button>
              </div>
            </div>
          )
        ) : (
          <button className="file-upload-tile-empty" onClick={() => inputRef.current?.click()} type="button">
            <Upload size={18} />
            <span>{buttonLabel}</span>
          </button>
        )}
        {status ? <p className="page-subtitle">{status}</p> : null}
      </div>
    );
  }

  return (
    <div className={`file-upload-field${compact ? " is-compact" : ""}`}>
      {hideLabel ? null : <span className="file-upload-label">{label}</span>}
      <input
        accept={accept}
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
        ref={inputRef}
        type="file"
      />
      {hasFile ? (
        imageMode && uploaded?.publicUrl ? (
          <div className="file-upload-preview">
            <img alt={uploaded.originalName} src={uploaded.publicUrl} />
            <div className="file-upload-preview-actions">
              <button className="button secondary" onClick={() => inputRef.current?.click()} type="button">
                <Upload size={16} />
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
            <strong>{uploaded?.originalName ?? "Файл прикреплён"}</strong>
            {uploaded?.publicUrl ? (
              <a className="file-upload-chip-link" href={uploaded.publicUrl} rel="noreferrer" target="_blank">
                Открыть
              </a>
            ) : null}
            <div className="auth-actions">
              <button className="button secondary" onClick={() => inputRef.current?.click()} type="button">
                <Upload size={16} />
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
        <button className="button secondary file-upload-empty" onClick={() => inputRef.current?.click()} type="button">
          <Upload size={16} />
          {buttonLabel}
        </button>
      )}
      {status ? <p className="page-subtitle">{status}</p> : null}
    </div>
  );
}
