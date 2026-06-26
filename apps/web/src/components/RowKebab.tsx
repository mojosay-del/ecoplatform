"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

export type ActionItem = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
};

// Универсальное kebab-меню «⋯» для строк списков. Открывается по клику,
// закрывается по клику снаружи и Escape. Меню рендерится порталом с fixed-
// позиционированием — чтобы его не обрезали контейнеры с overflow (напр.
// прокручиваемые таблицы). Используется в дереве уроков, новостях, сотрудниках.
export function RowKebab({ actions, className }: { actions: ActionItem[]; className?: string }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const reposition = () => {
    const button = containerRef.current?.querySelector(".tree-row-kebab-button");
    if (!button) return;
    const rect = button.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function onScrollOrResize() {
      // При прокрутке/ресайзе закрываем — fixed-меню иначе «отрывается» от кнопки.
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  const menu =
    open && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            className="tree-row-menu tree-row-menu-floating"
            role="menu"
            style={{ position: "fixed", top: coords.top, right: coords.right }}
          >
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
          </div>,
          document.body,
        )
      : null;

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
      {menu}
    </div>
  );
}
