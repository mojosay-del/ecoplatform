"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

export type ActionItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

// Универсальное kebab-меню «⋯» для строк списков. Открывается по клику,
// закрывается по клику снаружи и Escape. Используется в дереве уроков,
// в списках новостей и базе знаний.
export function RowKebab({ actions, className }: { actions: ActionItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`tree-row-kebab${className ? " " + className : ""}`} ref={containerRef}>
      <button
        type="button"
        className="tree-row-kebab-button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        aria-label="Действия"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open ? (
        <div className="tree-row-menu" role="menu">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              className={`tree-row-menu-item${action.danger ? " is-danger" : ""}`}
              onClick={(event) => {
                event.stopPropagation();
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
