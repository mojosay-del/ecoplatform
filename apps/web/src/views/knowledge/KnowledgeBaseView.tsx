"use client";

import type { KnowledgeArticleDetail, KnowledgeNode } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { KnowledgeArticleLoadingState } from "./KnowledgeArticle";
import { KnowledgeBaseLayout } from "./KnowledgeLayout";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";

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

  return <KnowledgeBaseLayout tree={data} activeArticle={null} activeSlug={undefined} />;
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
  if (tree.state === "error" || article.state === "error") {
    return <ErrorState title="База знаний" message={tree.errorMessage ?? article.errorMessage} />;
  }
  if (!article.data) {
    return <KnowledgeArticleLoadingState />;
  }

  return <KnowledgeBaseLayout tree={tree.data} activeArticle={article.data} activeSlug={slug} />;
}
