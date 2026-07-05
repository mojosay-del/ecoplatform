"use client";

// Витрина «Каталог архива»: hero с поиском, липкая лента-индекс категорий и
// editorial-секции с карточками-образцами. Заменяет прежний лейаут
// «дерево слева + пустое окно справа» на полноширинную витрину.

import { useMemo } from "react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { useCoverAssets } from "../../../lib/use-cover-assets";
import { KnowledgeSearchResults } from "../SearchResults";
import { buildKnowledgeIndexCodes, flattenKnowledgeNodes } from "../knowledge-utils";
import { useKnowledgeBaseSearch } from "../use-knowledge-search";
import { CatalogHero } from "./CatalogHero";
import { CatalogIndexRail } from "./CatalogIndexRail";
import { CatalogSection } from "./CatalogSection";

export function KnowledgeCatalog({ tree }: { tree: KnowledgeNode[] }) {
  const search = useKnowledgeBaseSearch();
  const codes = useMemo(() => buildKnowledgeIndexCodes(tree), [tree]);
  const flatNodes = useMemo(() => flattenKnowledgeNodes(tree), [tree]);
  const covers = useCoverAssets(flatNodes);

  return (
    <AppShell>
      <section className="page knowledge-page knowledge-catalog-page">
        <CatalogHero materialCount={flatNodes.length} search={search} />
        {tree.length === 0 ? (
          <div className="knowledge-empty">
            <p className="page-subtitle">Материалы пока не добавлены.</p>
          </div>
        ) : search.searching ? (
          <KnowledgeSearchResults
            covers={covers}
            loading={search.searchLoading}
            onResetSearch={search.resetSearch}
            query={search.debouncedQuery}
            results={search.searchResults ?? []}
            tree={tree}
          />
        ) : (
          <>
            <CatalogIndexRail categories={tree} codes={codes} />
            <div className="knowledge-catalog-sections">
              {tree.map((category) => (
                <CatalogSection category={category} codes={codes} covers={covers} key={category.id} />
              ))}
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}
