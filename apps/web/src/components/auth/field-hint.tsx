"use client";

// Кнопка-подсказка «?» рядом с заголовком поля + маленькая модалка с пояснением.
// По образцу «Как работает закрытый аукцион» на площадке (views/marketplace/
// AuctionInfo.tsx): портальная модалка, закрытие по фону/Esc/крестику. Выносит
// длинные требования (например к паролю) из тела формы в компактную подсказку.

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

export function FieldHint({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" className="field-hint-btn" onClick={() => setOpen(true)} aria-label={title} title={title}>
        <HelpCircle aria-hidden="true" size={15} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="field-hint-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label={title}
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className="field-hint-modal">
                <div className="field-hint-modal-head">
                  <h2>{title}</h2>
                  <button
                    type="button"
                    className="field-hint-modal-close"
                    onClick={() => setOpen(false)}
                    aria-label="Закрыть"
                  >
                    <X aria-hidden="true" size={18} />
                  </button>
                </div>
                <div className="field-hint-modal-body">{children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
