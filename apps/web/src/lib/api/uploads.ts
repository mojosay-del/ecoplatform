import { API_URL } from "./config";
import { ApiError, extractApiErrorMessage } from "./errors";
import type { FileAsset } from "./file-assets";
import {
  CSRF_HEADER_NAME,
  ensureCsrfToken,
  fetchWithAuthRetry,
  getAccessToken,
  handleUnauthorized,
  refreshAccessToken,
} from "./session";

// Изображения ужимаем прямо в браузере перед загрузкой. Иначе тяжёлый оригинал
// (фото с телефона на 5–10 МБ) на обычном канале передаётся 30+ секунд,
// соединение обрывается и пользователь видит «Load failed».
// Обложки сервер и так пересжимает до 1200px → гоним их в JPEG. Контентные
// картинки хранятся как есть, поэтому для них только уменьшаем слишком большие
// и СОХРАНЯЕМ формат (PNG-скриншоты/схемы не портим перекодировкой в JPEG).
const CLIENT_RESIZABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const COVER_MAX_DIMENSION = 1600;
const CONTENT_IMAGE_MAX_DIMENSION = 2048;
const IMAGE_JPEG_QUALITY = 0.85;
const SKIP_RESIZE_BELOW_BYTES = 1_500_000;

async function downscaleImageForUpload(
  file: File,
  options: { maxDimension: number; forceJpeg?: boolean },
): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  if (!CLIENT_RESIZABLE_IMAGE_TYPES.has(file.type)) return file;

  try {
    // imageOrientation: "from-image" применяет EXIF-поворот — иначе после
    // перекодировки в canvas фото с телефона легло бы набок.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const longest = Math.max(bitmap.width, bitmap.height);
    const needsResize = longest > options.maxDimension;

    // Уже небольшую и лёгкую картинку не трогаем — без лишней перекодировки.
    if (!needsResize && file.size <= SKIP_RESIZE_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const scale = needsResize ? options.maxDimension / longest : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const outputType = options.forceJpeg ? "image/jpeg" : file.type;
    const quality = outputType === "image/png" ? undefined : IMAGE_JPEG_QUALITY;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((result) => resolve(result), outputType, quality),
    );
    if (!blob || blob.size === 0 || blob.size >= file.size) return file;

    const extension = outputType === "image/png" ? ".png" : outputType === "image/webp" ? ".webp" : ".jpg";
    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${baseName}${extension}`, { type: outputType });
  } catch {
    // Не удалось обработать (необычный формат и т.п.) — грузим оригинал.
    return file;
  }
}

async function prepareUploadFile(file: File, imagePreset?: "cover"): Promise<File> {
  if (imagePreset === "cover") {
    return downscaleImageForUpload(file, { maxDimension: COVER_MAX_DIMENSION, forceJpeg: true });
  }
  if (file.type.startsWith("image/")) {
    return downscaleImageForUpload(file, { maxDimension: CONTENT_IMAGE_MAX_DIMENSION });
  }
  return file;
}

// Загрузка с прогрессом. fetch() не умеет отдавать upload-progress, поэтому
// здесь XMLHttpRequest. Воспроизводим ту же авторизацию, что и fetchWithAuthRetry:
// Bearer-токен, CSRF-заголовок, cookie (withCredentials) и один ретрай на 401.
export async function apiUploadFileWithProgress(
  file: File,
  options: {
    token?: string | null;
    accessLevel?: FileAsset["accessLevel"];
    imagePreset?: "cover";
    onProgress?: (fraction: number) => void;
    signal?: AbortSignal;
  } = {},
): Promise<FileAsset> {
  const prepared = await prepareUploadFile(file, options.imagePreset);

  const send = async (authToken: string | null): Promise<{ status: number; body: string }> => {
    const csrfToken = await ensureCsrfToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let abortHandler: (() => void) | null = null;
      const cleanup = () => {
        if (abortHandler) {
          options.signal?.removeEventListener("abort", abortHandler);
          abortHandler = null;
        }
      };
      xhr.open("POST", `${API_URL}/files/upload`);
      xhr.withCredentials = true;
      if (authToken) xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      xhr.setRequestHeader(CSRF_HEADER_NAME, csrfToken);

      if (xhr.upload && options.onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) options.onProgress?.(event.loaded / event.total);
        };
      }
      xhr.onload = () => {
        cleanup();
        resolve({ status: xhr.status, body: xhr.responseText });
      };
      xhr.onerror = () => {
        cleanup();
        reject(new ApiError("Не удалось загрузить файл. Проверьте соединение.", 0));
      };
      xhr.onabort = () => {
        cleanup();
        reject(new ApiError("Загрузка отменена.", 0));
      };

      if (options.signal) {
        if (options.signal.aborted) {
          xhr.abort();
          return;
        }
        abortHandler = () => xhr.abort();
        options.signal.addEventListener("abort", abortHandler, { once: true });
      }

      const formData = new FormData();
      formData.append("file", prepared);
      formData.append("accessLevel", options.accessLevel ?? "public");
      if (options.imagePreset) formData.append("imagePreset", options.imagePreset);
      xhr.send(formData);
    });
  };

  const currentToken = options.token ?? getAccessToken();
  let result = await send(currentToken);

  if (result.status === 401 && currentToken) {
    try {
      const refreshed = await refreshAccessToken();
      result = await send(refreshed);
    } catch {
      handleUnauthorized();
    }
  }

  if (result.status < 200 || result.status >= 300) {
    if (result.status === 401) handleUnauthorized();
    throw new ApiError(extractApiErrorMessage(result.body) || "File upload failed", result.status);
  }

  options.onProgress?.(1);
  return JSON.parse(result.body) as FileAsset;
}

export async function apiDeleteFile(fileId: string, options: { token?: string | null } = {}): Promise<{ ok: boolean }> {
  const response = await fetchWithAuthRetry(
    `/files/${encodeURIComponent(fileId)}`,
    {
      method: "DELETE",
    },
    options.token,
  );

  if (!response.ok) {
    if (response.status === 401) {
      handleUnauthorized();
    }
    const message = extractApiErrorMessage(await response.text());
    throw new ApiError(message || "File delete failed", response.status);
  }

  return response.json() as Promise<{ ok: boolean }>;
}
