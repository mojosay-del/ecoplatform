"use client";

// Кнопка-подсказка в ленте площадки + маленькая модалка «Как работает закрытый
// аукцион». Объяснение доступно рядом с заголовком ленты и не занимает место на карте.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HelpCircle, X } from "lucide-react";

const AUCTION_POINTS = [
  "Ставки других покупателей скрыты — каждый предлагает свою цену вслепую.",
  "Продавец видит цены без названий компаний и выбирает лучшее предложение.",
  "Контакты сторон раскрываются только после принятия предложения.",
];

export function AuctionInfo() {
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
      <button
        type="button"
        className="mp-auction-info-btn"
        onClick={() => setOpen(true)}
        aria-label="Как работает закрытый аукцион"
        title="Как работает закрытый аукцион"
      >
        <HelpCircle aria-hidden="true" size={16} />
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="mp-auction-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-label="Как работает закрытый аукцион"
              onClick={(event) => {
                if (event.target === event.currentTarget) setOpen(false);
              }}
            >
              <div className="mp-auction-modal">
                <div className="mp-auction-modal-head">
                  <h2>Как работает закрытый аукцион</h2>
                  <button
                    type="button"
                    className="mp-auction-modal-close"
                    onClick={() => setOpen(false)}
                    aria-label="Закрыть"
                  >
                    <X aria-hidden="true" size={20} />
                  </button>
                </div>
                <ul className="mp-auction-modal-list">
                  {AUCTION_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
