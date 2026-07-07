"use client";

// «Квиток-требование» на скачивание: премиум-карточка с эмблемой формата, именем
// файла, размером и крупным CTA. Липкая справа на десктопе.

import { useCallback, useState } from "react";
import { Download } from "lucide-react";
import type { DocumentationDetail } from "@ecoplatform/shared";
import { fmtStyle } from "../doc-badges";
import { formatLabel } from "../documentFormats";
import { formatBytes, formatRuDate } from "../doc-helpers";
import { triggerDocumentDownload } from "../download";

export function DocumentRequisition({ document }: { document: DocumentationDetail }) {
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const onDownload = useCallback(async () => {
    if (pending) return;
    setDownloadError(null);
    setPending(true);
    const message = await triggerDocumentDownload(document);
    setPending(false);
    if (message) setDownloadError(message);
  }, [document, pending]);

  const effective = formatRuDate(document.effectiveDate);

  return (
    <aside className="doc-requisition" aria-label="Файл документа" style={fmtStyle(document.file?.format)}>
      {document.file ? (
        <>
          <div className="doc-requisition-head">
            <span aria-hidden="true" className="doc-requisition-emblem">
              {formatLabel(document.file.format)}
            </span>
            <div className="doc-requisition-meta">
              <p className="doc-requisition-name">{document.file.fileName}</p>
              <p className="doc-requisition-size">
                {formatBytes(document.file.sizeBytes)}
                {document.version ? ` · Версия ${document.version}` : ""}
              </p>
            </div>
          </div>
          {effective ? (
            <p className="doc-requisition-effective">
              <span>Действует с</span>
              <strong>{effective}</strong>
            </p>
          ) : null}
          <button
            type="button"
            className="doc-requisition-cta"
            onClick={onDownload}
            disabled={pending}
            aria-busy={pending || undefined}
          >
            <Download size={16} aria-hidden="true" />
            {pending ? "Готовим файл…" : "Скачать документ"}
          </button>
          {downloadError ? (
            <p className="doc-download-error is-panel" role="alert">
              {downloadError}
            </p>
          ) : null}
        </>
      ) : (
        <p className="doc-requisition-empty">Файл не прикреплён.</p>
      )}
    </aside>
  );
}
