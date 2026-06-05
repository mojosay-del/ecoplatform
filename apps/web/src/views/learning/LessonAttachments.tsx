"use client";

import {
  Download,
  File as FileIcon,
  FileArchive,
  FileImage,
  FileMusic,
  FileSpreadsheet,
  FileText,
  FileVideoCamera,
  Presentation,
} from "lucide-react";

// Вложения уроков отдаёт сам API в составе урока: для приватных файлов это
// короткоживущая presigned-ссылка (downloadUrl), выданная только при наличии
// доступа к уроку. Отдельный запрос в /files?ids больше не нужен — поэтому
// бывший пользователь без подписки ссылку уже не получит.
export function LessonAttachments({
  attachments,
}: {
  attachments: Array<{
    fileId: string;
    displayName: string;
    downloadUrl?: string | null;
    originalName?: string | null;
    mimeType?: string | null;
  }>;
}) {
  return (
    <div className="lesson-material-list">
      {attachments.map((attachment, index) => {
        const Icon = resolveLessonMaterialIcon(
          { mimeType: attachment.mimeType, originalName: attachment.originalName },
          attachment.displayName,
        );
        return (
          <div className="lesson-material-item" key={index}>
            <span className="lesson-material-icon" aria-hidden>
              <Icon size={16} />
            </span>
            <strong className="lesson-material-title" title={attachment.displayName}>
              {attachment.displayName}
            </strong>
            {attachment.downloadUrl ? (
              <a
                className="lesson-material-download"
                href={attachment.downloadUrl}
                download={attachment.displayName}
                rel="noreferrer"
                target="_blank"
                title={`Скачать ${attachment.displayName}`}
                aria-label={`Скачать ${attachment.displayName}`}
              >
                <Download size={15} />
                <span>Скачать</span>
              </a>
            ) : (
              <span className="lesson-material-unavailable">Недоступен</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function resolveLessonMaterialIcon(
  asset: { mimeType?: string | null; originalName?: string | null } | undefined,
  displayName: string,
) {
  const mimeType = asset?.mimeType?.toLowerCase() ?? "";
  const fileName = `${asset?.originalName ?? ""} ${displayName}`.toLowerCase();

  if (mimeType.startsWith("image/") || /\.(avif|gif|jpe?g|png|webp)$/.test(fileName)) return FileImage;
  if (mimeType.startsWith("video/") || /\.(mp4|webm)$/.test(fileName)) return FileVideoCamera;
  if (mimeType.startsWith("audio/") || /\.(mp3|ogg|wav|weba)$/.test(fileName)) return FileMusic;
  if (mimeType.includes("spreadsheet") || mimeType.includes("ms-excel") || /\.(xls|xlsx)$/.test(fileName)) {
    return FileSpreadsheet;
  }
  if (mimeType.includes("presentation") || mimeType.includes("ms-powerpoint") || /\.(ppt|pptx)$/.test(fileName)) {
    return Presentation;
  }
  if (mimeType.includes("zip") || /\.zip$/.test(fileName)) return FileArchive;
  if (
    mimeType === "application/pdf" ||
    mimeType.includes("word") ||
    mimeType.includes("msword") ||
    /\.(doc|docx|pdf)$/.test(fileName)
  ) {
    return FileText;
  }
  return FileIcon;
}
