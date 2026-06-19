"use client";

import { useRef } from "react";
import { X } from "lucide-react";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { useDialogA11y } from "../lib/use-dialog-a11y";
import { KnowledgeNavigation } from "./knowledge-base-navigation";

export function KnowledgeNavigationDrawer({
  activeSlug,
  onClose,
  onNavigate,
  tree,
}: {
  activeSlug?: string;
  onClose: () => void;
  onNavigate: () => void;
  tree: KnowledgeNode[];
}) {
  const drawerRef = useRef<HTMLElement>(null);
  useDialogA11y(drawerRef, { bodyLock: false, onEscape: onClose });

  return (
    <div
      className="knowledge-nav-drawer-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="knowledge-nav-drawer-title"
    >
      <button
        className="knowledge-nav-drawer-backdrop"
        type="button"
        onClick={onClose}
        aria-label="Закрыть навигацию по сырью"
      />
      <aside className="knowledge-nav-drawer" id="knowledge-material-nav-drawer" ref={drawerRef}>
        <header className="knowledge-nav-drawer-head">
          <div>
            <span className="knowledge-nav-kicker">База знаний</span>
            <h2 id="knowledge-nav-drawer-title">Навигация по сырью</h2>
          </div>
          <button className="knowledge-nav-drawer-close" type="button" onClick={onClose} aria-label="Закрыть">
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="knowledge-nav-drawer-body">
          <KnowledgeNavigation tree={tree} activeSlug={activeSlug} showHeading={false} onNavigate={onNavigate} />
        </div>
      </aside>
    </div>
  );
}
