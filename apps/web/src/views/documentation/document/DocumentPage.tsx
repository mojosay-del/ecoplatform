"use client";

// Страница документа — «Дело»: паспорт-hero, указатель реестра слева, текст с
// оглавлением и квитком-скачиванием справа, навигация по соседям.

import { PanelRightOpen } from "lucide-react";
import { useMemo } from "react";
import type { DocumentationDetail, DocumentationNode } from "@ecoplatform/shared";
import { AppShell } from "../../../components/AppShell";
import { ContentBlocks } from "../../content-blocks";
import { DocumentationDrawer } from "../DocumentationDrawer";
import {
  buildDocumentationIndexCodes,
  findDocumentationNeighbors,
  extractDocumentationToc,
} from "../documentation-utils";
import { useDocumentationMobileNav } from "../use-documentation-mobile-nav";
import { DocumentHero } from "./DocumentHero";
import { DocumentNeighbors } from "./DocumentNeighbors";
import { DocumentRequisition } from "./DocumentRequisition";
import { DocumentSidebar } from "./DocumentSidebar";
import { DocumentToc, DOCUMENTATION_HEADING_ANCHOR_PREFIX } from "./DocumentToc";

export function DocumentPage({ active, tree }: { active: DocumentationDetail; tree: DocumentationNode[] }) {
  const nav = useDocumentationMobileNav();
  const blocks = useMemo(() => active.blocks ?? [], [active.blocks]);
  const codes = useMemo(() => buildDocumentationIndexCodes(tree), [tree]);
  const breadcrumbs = useMemo(
    () => active.breadcrumbs.map((crumb) => ({ title: crumb.title, slug: crumb.slug })),
    [active.breadcrumbs],
  );
  const neighbors = useMemo(() => findDocumentationNeighbors(tree, active.slug), [tree, active.slug]);
  const toc = useMemo(() => extractDocumentationToc(blocks), [blocks]);

  const mobileTopbarAction =
    tree.length > 0 ? (
      <button
        className="icon-button doc-topbar-nav-trigger"
        type="button"
        onClick={nav.openNav}
        aria-controls="documentation-nav-drawer"
        aria-expanded={nav.navOpen}
        aria-label="Открыть разделы реестра"
        title="Открыть разделы реестра"
      >
        <PanelRightOpen size={20} aria-hidden="true" />
      </button>
    ) : null;

  return (
    <AppShell chrome={{ mobileTopbarAction }}>
      <section className="page doc-page doc-document-page">
        <DocumentHero active={active} breadcrumbs={breadcrumbs} indexCode={codes.get(active.slug)} />
        <div className="doc-document-layout">
          <DocumentSidebar activeSlug={active.slug} codes={codes} tree={tree} />
          <div className={`doc-document-main${toc.length >= 3 ? " has-toc" : ""}`}>
            <div className="doc-document-rail">
              <DocumentRequisition document={active} />
              <DocumentToc entries={toc} />
            </div>
            <div className="doc-document-flow">
              <article className="doc-document-content content-article">
                {blocks.length > 0 ? (
                  <ContentBlocks blocks={blocks} headingAnchorPrefix={DOCUMENTATION_HEADING_ANCHOR_PREFIX} />
                ) : (
                  <p className="page-subtitle">Описание появится после наполнения документа.</p>
                )}
              </article>
              <DocumentNeighbors neighbors={neighbors} />
            </div>
          </div>
        </div>
        {nav.navOpen ? (
          <DocumentationDrawer
            activeSlug={active.slug}
            codes={codes}
            onClose={nav.closeNav}
            onNavigate={nav.closeNav}
            tree={tree}
          />
        ) : null}
      </section>
    </AppShell>
  );
}
