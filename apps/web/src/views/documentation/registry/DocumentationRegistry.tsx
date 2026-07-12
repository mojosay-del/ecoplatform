"use client";

// Витрина «Реестр документов»: editorial-hero с поиском, полка «Часто нужные»,
// липкая лента-указатель со scroll-spy, секции-разделы с карточками-документами
// и журнал «Недавно обновлено». Заменяет прежний лейаут «дерево + сетка».

import { useCallback, useMemo, useState } from "react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { useApiQuery } from "../../shared";
import { api } from "../../../lib/api";
import { queryKeys } from "../../../lib/query";
import { buildDocumentationIndexCodes } from "../documentation-utils";
import { flattenDocuments } from "../doc-helpers";
import { triggerDocumentDownload } from "../download";
import { useDocumentationSearch } from "../use-documentation-search";
import { EssentialsShelf } from "./EssentialsShelf";
import { FormatLegend } from "./FormatLegend";
import { RecentLedger } from "./RecentLedger";
import { RegistryHero } from "./RegistryHero";
import { RegistryIndexRail } from "./RegistryIndexRail";
import { RegistrySearchResults } from "./RegistrySearchResults";
import { RegistrySection } from "./RegistrySection";

const TOP_DOCUMENTS_SLUG = "obshchie-dokumenty";

export function DocumentationRegistry({ tree }: { tree: DocumentationNode[] }) {
  const search = useDocumentationSearch();
  const pinned = useApiQuery(
    queryKeys.documentation.pinned(),
    () => api.documentation.pinned(),
    [] as DocumentationNode[],
  );
  const recent = useApiQuery(
    queryKeys.documentation.recent(6),
    () => api.documentation.recent(6),
    [] as DocumentationNode[],
  );

  const [format, setFormat] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const codes = useMemo(() => buildDocumentationIndexCodes(tree), [tree]);
  const allDocuments = useMemo(() => flattenDocuments(tree), [tree]);
  const categories = useMemo(() => tree.filter((node) => node.iconType === "category"), [tree]);
  const topDocuments = useMemo(() => tree.filter((node) => node.iconType !== "category"), [tree]);

  const formats = useMemo(() => {
    const set = new Set<string>();
    for (const doc of allDocuments) {
      if (doc.file) set.add(doc.file.format);
    }
    return Array.from(set).sort();
  }, [allDocuments]);

  // Синтетический раздел «Общие документы» для верхнеуровневых документов вне
  // категорий — чтобы они не терялись в реестре.
  const topSection = useMemo<DocumentationNode | null>(() => {
    if (topDocuments.length === 0) return null;
    return {
      id: "__general__",
      slug: TOP_DOCUMENTS_SLUG,
      title: "Общие документы",
      subtitle: null,
      iconType: "category",
      displayIcon: null,
      parentId: null,
      position: -1,
      status: "published",
      isPinned: false,
      version: null,
      effectiveDate: null,
      firstPublishedAt: null,
      revisedAt: null,
      file: null,
      children: topDocuments,
    };
  }, [topDocuments]);

  const sections = useMemo(() => (topSection ? [topSection, ...categories] : categories), [topSection, categories]);

  const onDownload = useCallback(async (node: DocumentationNode) => {
    setDownloadError(null);
    const message = await triggerDocumentDownload(node);
    if (message) setDownloadError(message);
  }, []);

  return (
    <AppShell>
      <section className="page doc-page doc-registry-page">
        <RegistryHero documentCount={allDocuments.length} search={search} />
        {downloadError ? (
          <p className="doc-download-error" role="alert">
            {downloadError}
          </p>
        ) : null}

        {tree.length === 0 ? (
          <div className="doc-empty">
            <p className="page-subtitle">Документы пока не добавлены.</p>
          </div>
        ) : search.searching ? (
          <RegistrySearchResults
            loading={search.searchLoading}
            onDownload={onDownload}
            onResetSearch={search.resetSearch}
            query={search.debouncedQuery}
            results={search.searchResults ?? []}
            tree={tree}
          />
        ) : (
          <>
            <EssentialsShelf items={pinned.data} onDownload={onDownload} />
            <FormatLegend active={format} formats={formats} onChange={setFormat} />
            <RegistryIndexRail codes={codes} sections={sections} />
            <div className="doc-sections" data-tour="doc-sections">
              {sections.map((section) => (
                <RegistrySection
                  codes={codes}
                  format={format}
                  key={section.id}
                  onDownload={onDownload}
                  section={section}
                />
              ))}
            </div>
            <RecentLedger items={recent.data} />
          </>
        )}
      </section>
    </AppShell>
  );
}
