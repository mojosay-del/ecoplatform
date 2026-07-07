"use client";

// Тонкий вход витрины документации: загружает дерево реестра, разбирает состояния
// доступа и делегирует отрисовку «Реестру».

import type { DocumentationNode } from "@ecoplatform/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/query";
import { AccessClosed, AuthRequired, ErrorState, useApiQuery } from "../shared";
import { DocumentationRegistry } from "./registry/DocumentationRegistry";

export function DocumentationView() {
  const { data, state, errorMessage } = useApiQuery(
    queryKeys.documentation.tree(),
    () => api.documentation.tree(),
    [] as DocumentationNode[],
  );

  if (state === "unauthenticated") return <AuthRequired title="Документация" />;
  if (state === "forbidden") return <AccessClosed title="Документация" />;
  if (state === "error") return <ErrorState title="Документация" message={errorMessage} />;

  return <DocumentationRegistry tree={data} />;
}
