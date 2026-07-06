"use client";

import Link from "next/link";
import { ArchiveX, ArrowLeft } from "lucide-react";
import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { AppShell } from "../../components/AppShell";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { AccessClosed, AuthRequired, ErrorState, PageHeader, useApiQuery } from "../shared";
import { KnowledgeArticlePage } from "./article/KnowledgeArticlePage";
import { KnowledgeCatalog } from "./catalog/KnowledgeCatalog";

export function KnowledgeBaseView() {
  const { data, state, errorMessage } = useApiQuery(
    queryKeys.knowledgeBase.tree(),
    () => api.knowledgeBase.tree(),
    [] as KnowledgeNode[],
  );

  if (state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (state === "error") {
    return <ErrorState title="База знаний" message={errorMessage} />;
  }

  return <KnowledgeCatalog tree={data} />;
}

export function KnowledgeArticleView({ slug }: { slug: string }) {
  const tree = useApiQuery(queryKeys.knowledgeBase.tree(), () => api.knowledgeBase.tree(), [] as KnowledgeNode[]);
  const article = useApiQuery<KnowledgeArticleDetail | null>(
    queryKeys.knowledgeBase.article(slug),
    () => api.knowledgeBase.getArticle(slug),
    null,
  );

  if (tree.state === "unauthenticated" || article.state === "unauthenticated") {
    return <AuthRequired title="База знаний" />;
  }
  if (tree.state === "forbidden" || article.state === "forbidden") {
    return <AccessClosed title="База знаний" />;
  }
  if (article.state === "error" && article.errorStatus === 404) {
    return <KnowledgeArticleNotFound />;
  }
  if (tree.state === "error" || article.state === "error") {
    return <ErrorState title="База знаний" message={tree.errorMessage ?? article.errorMessage} />;
  }
  if (!article.data) {
    return <KnowledgeArticleLoadingState />;
  }

  return <KnowledgeArticlePage active={article.data} tree={tree.data} />;
}

function KnowledgeArticleNotFound() {
  return (
    <AppShell>
      <section className="page knowledge-page">
        <div className="knowledge-not-found">
          <span aria-hidden="true" className="knowledge-not-found-icon">
            <ArchiveX size={30} strokeWidth={1.8} />
          </span>
          <h1 className="knowledge-not-found-title">Материал не найден</h1>
          <p className="knowledge-not-found-text">
            Такого листа в архиве нет — возможно, материал переименовали или убрали из каталога.
          </p>
          <Link className="button" href="/knowledge-base">
            <ArrowLeft aria-hidden="true" size={16} strokeWidth={2.4} />
            Весь каталог
          </Link>
        </div>
      </section>
    </AppShell>
  );
}

export function KnowledgeArticleLoadingState() {
  return (
    <AppShell>
      <section className="page">
        <PageHeader title="База знаний" />
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
