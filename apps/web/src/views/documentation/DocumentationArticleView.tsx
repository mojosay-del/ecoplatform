"use client";

// Тонкий вход страницы документа: грузит дерево реестра и сам документ, разбирает
// состояния доступа/ошибок (включая 404 → «Документ не найден») и делегирует «Делу».

import Link from "next/link";
import { ArchiveX, ArrowLeft } from "lucide-react";
import type { DocumentationDetail, DocumentationNode } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { DocumentPage } from "./document/DocumentPage";

export function DocumentationArticleView({ slug }: { slug: string }) {
  const tree = useApiQuery(queryKeys.documentation.tree(), () => api.documentation.tree(), [] as DocumentationNode[]);
  const document = useApiQuery<DocumentationDetail | null>(
    queryKeys.documentation.document(slug),
    () => api.documentation.getDocument(slug),
    null,
  );

  if (tree.state === "unauthenticated" || document.state === "unauthenticated") {
    return <AuthRequired title="Документация" />;
  }
  if (tree.state === "forbidden" || document.state === "forbidden") {
    return <AccessClosed title="Документация" />;
  }
  if (document.state === "error" && document.errorStatus === 404) {
    return <DocumentNotFound />;
  }
  if (tree.state === "error" || document.state === "error") {
    return <ErrorState title="Документация" message={tree.errorMessage ?? document.errorMessage} />;
  }
  if (!document.data) {
    return <DocumentLoadingState />;
  }

  return <DocumentPage active={document.data} tree={tree.data} />;
}

function DocumentNotFound() {
  return (
    <AppShell>
      <section className="page doc-page">
        <div className="doc-not-found">
          <span aria-hidden="true" className="doc-not-found-icon">
            <ArchiveX size={30} strokeWidth={1.8} />
          </span>
          <h1 className="doc-not-found-title">Документ не найден</h1>
          <p className="doc-not-found-text">
            Такого дела в реестре нет — возможно, документ переименовали или сняли с публикации.
          </p>
          <Link className="button" href="/documentation">
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.4} />
            Весь реестр
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

function DocumentLoadingState() {
  return (
    <AppShell>
      <section className="page">
        <PageHeader title="Документация" />
        <div className="page-skeleton-body page-skeleton-article" aria-busy="true">
          <div className="page-skeleton-bar w-3-4" />
          <div className="page-skeleton-bar w-2-3" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-full" />
          <div className="page-skeleton-bar w-1-2" />
        </div>
      </section>
    </AppShell>
  );
}
