import { randomUUID } from "crypto";
import { extname } from "path";
import { normalizeFileNameEncoding } from "./file-name.helpers";

const SAFE_NAME_PATTERN = /[^a-zA-Z0-9._-]+/g;
export const GENERIC_DECLARED_MIME_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);
export const BLOCKED_UPLOAD_MIME_TYPES = new Set([
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
  "application/xml",
  "text/xml",
  "application/javascript",
  "text/javascript",
  "application/x-msdownload",
]);
const BLOCKED_UPLOAD_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".cpl",
  ".dll",
  ".exe",
  ".htm",
  ".html",
  ".js",
  ".mjs",
  ".msi",
  ".php",
  ".ps1",
  ".scr",
  ".sh",
  ".svg",
  ".xhtml",
  ".xml",
]);
const ALLOWED_DETECTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/zip",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
]);
const MIME_ALIASES: Record<string, string[]> = {
  "application/zip": ["application/x-zip-compressed", "multipart/x-zip"],
  "application/pdf": ["application/x-pdf"],
  "image/jpeg": ["image/pjpeg"],
  "video/quicktime": ["video/mov"],
};

export function normalizeMimeType(mimeType: string | undefined | null): string {
  return (mimeType ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

export function canonicalMimeType(mimeType: string): string {
  for (const [canonical, aliases] of Object.entries(MIME_ALIASES)) {
    if (mimeType === canonical || aliases.includes(mimeType)) {
      return canonical;
    }
  }

  return mimeType;
}

export function isAllowedDetectedMime(mimeType: string): boolean {
  return ALLOWED_DETECTED_MIME_TYPES.has(mimeType) || mimeType.startsWith("audio/") || mimeType.startsWith("video/");
}

export function isDeclaredMimeCompatible(declaredMime: string, detectedMime: string): boolean {
  if (!declaredMime || GENERIC_DECLARED_MIME_TYPES.has(declaredMime)) {
    return true;
  }
  if (declaredMime === detectedMime) {
    return true;
  }

  return (MIME_ALIASES[detectedMime] ?? []).includes(declaredMime);
}

export function hasBlockedExtension(originalName: string): boolean {
  return BLOCKED_UPLOAD_EXTENSIONS.has(extname(normalizeFileNameEncoding(originalName)).toLowerCase());
}

function attachmentDisposition(originalName: string): string {
  const normalizedName = normalizeFileNameEncoding(originalName);
  const fallback = (normalizedName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "file").slice(0, 120);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(normalizedName)}`;
}

export function contentDisposition(mimeType: string, originalName: string): string | undefined {
  if (mimeType.startsWith("image/") || mimeType.startsWith("audio/") || mimeType.startsWith("video/")) {
    return undefined;
  }

  return attachmentDisposition(originalName);
}

export function downloadContentDisposition(originalName: string): string {
  const normalizedName = normalizeFileNameEncoding(originalName);
  // filename* (RFC 5987) корректно отдаёт кириллические имена при скачивании.
  return `attachment; filename*=UTF-8''${encodeURIComponent(normalizedName)}`;
}

export function buildStorageKey(originalName: string, extensionOverride?: string): string {
  const normalizedName = normalizeFileNameEncoding(originalName);
  const originalExtension = extname(normalizedName).toLowerCase();
  const extension = extensionOverride ?? originalExtension;
  const baseName = normalizedName
    .slice(0, Math.max(0, normalizedName.length - originalExtension.length))
    .trim()
    .replace(SAFE_NAME_PATTERN, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const safeBaseName = baseName || "file";
  const date = new Date().toISOString().slice(0, 10);

  return `uploads/${date}/${randomUUID()}-${safeBaseName}${extension}`;
}

export function storageKeyWithExtension(storageKey: string, extension: string): string {
  const currentExtension = extname(storageKey);
  return `${storageKey.slice(0, Math.max(0, storageKey.length - currentExtension.length))}${extension}`;
}
