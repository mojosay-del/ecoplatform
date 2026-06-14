"use client";
import "../../styles/documentation.css";

// Страница документа: описание (блоки) + панель скачивания с форматом, версией и
// датой «действует с». Фокусный вид для чтения и скачивания.

import Link from "next/link";
import { useCallback } from "react";
import { ArrowLeft, Download } from "lucide-react";
import type { DocumentationDetail } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { ContentBlocks } from "../content-blocks";
import { FormatBadge } from "./components";
import { formatBytes, formatRuDate } from "./doc-helpers";
import { triggerDocumentDownload } from "./download";

export function DocumentationArticleView({ slug }: { slug: string }) {
  const { data, state, errorMessage } = useApiQuery<DocumentationDetail | null>(
    `doc:${slug}`,
    () => api.documentation.getDocument(slug),
    null,
  );

  const onDownload = useCallback(() => {
    if (data) void triggerDocumentDownload(data);
  }, [data]);

  if (state === "unauthenticated") return <AuthRequired title="Документация" />;
  if (state === "forbidden") return <AccessClosed title="Документация" />;
  if (state === "error") return <ErrorState title="Документация" message={errorMessage} />;
  if (!data) {
    return (
      <AppShell>
        <section className="page">
          <PageHeader title="Документация" />
          <div className="page-skeleton-body page-skeleton-article" aria-busy="true">
            <div className="page-skeleton-bar w-3-4" />
            <div className="page-skeleton-bar w-2-3" />
            <div className="page-skeleton-bar w-full" />
            <div className="page-skeleton-bar w-1-2" />
          </div>
        </section>
      </AppShell>
    );
  }

  const effective = formatRuDate(data.effectiveDate);
  return (
    <AppShell>
      <section className="page doc-detail-page">
        <Link className="doc-back" href="/documentation">
          <ArrowLeft size={15} aria-hidden="true" />
          Вся документация
        </Link>
        <header className="doc-detail-head">
          {data.breadcrumbs.length > 0 ? (
            <p className="doc-detail-crumbs">{data.breadcrumbs.map((crumb) => crumb.title).join(" / ")}</p>
          ) : null}
          <h1>{data.title}</h1>
          {data.subtitle ? <p className="doc-detail-sub">{data.subtitle}</p> : null}
          {data.version || effective ? (
            <div className="doc-detail-pills">
              {data.version ? <span className="doc-pill">Версия {data.version}</span> : null}
              {effective ? <span className="doc-pill doc-pill-date">Действует с {effective}</span> : null}
            </div>
          ) : null}
        </header>
        <div className="doc-detail-body">
          <article className="doc-detail-content">
            {data.blocks.length > 0 ? (
              <ContentBlocks blocks={data.blocks} />
            ) : (
              <p className="page-subtitle">Описание появится после наполнения документа.</p>
            )}
          </article>
          <aside className="doc-download-panel" aria-label="Файл документа">
            {data.file ? (
              <>
                <FormatBadge format={data.file.format} />
                <p className="doc-file-name">{data.file.fileName}</p>
                <p className="doc-file-size">{formatBytes(data.file.sizeBytes)}</p>
                <button type="button" className="doc-dl is-block" onClick={onDownload}>
                  <Download size={15} aria-hidden="true" />
                  Скачать
                </button>
              </>
            ) : (
              <p className="page-subtitle">Файл не прикреплён.</p>
            )}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
