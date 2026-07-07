"use client";

// Мобильный drawer навигации по реестру: переиспользует «указатель реестра».

import { useRef } from "react";
import { X } from "lucide-react";
import type { DocumentationNode } from "@ecoplatform/shared";
import { useDialogA11y } from "../../lib/use-dialog-a11y";
import { DocumentSidebar } from "./document/DocumentSidebar";

export function DocumentationDrawer({
  activeSlug,
  codes,
  onClose,
  onNavigate,
  tree,
}: {
  activeSlug?: string;
  codes: Map<string, string>;
  onClose: () => void;
  onNavigate: () => void;
  tree: DocumentationNode[];
}) {
  const drawerRef = useRef<HTMLElement>(null);
  useDialogA11y(drawerRef, { bodyLock: false, onEscape: onClose });

  return (
    <div
      className="doc-nav-drawer-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="documentation-nav-drawer-title"
    >
      <button
        className="doc-nav-drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Закрыть навигацию по реестру"
      />
      <aside className="doc-nav-drawer" id="documentation-nav-drawer" ref={drawerRef}>
        <header className="doc-nav-drawer-head">
          <div>
            <span className="doc-nav-kicker">Документация</span>
            <h2 id="documentation-nav-drawer-title">Разделы реестра</h2>
          </div>
          <button className="doc-nav-drawer-close" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="doc-nav-drawer-body">
          <DocumentSidebar
            activeSlug={activeSlug}
            codes={codes}
            onNavigate={onNavigate}
            showCatalogLink={false}
            tree={tree}
          />
        </div>
      </aside>
    </div>
  );
}
