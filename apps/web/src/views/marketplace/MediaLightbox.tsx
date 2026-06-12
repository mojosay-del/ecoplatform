"use client";

// Полноэкранный просмотр медиа объявления: фото целиком (contain), видео с
// плеером. Esc закрывает через РОДИТЕЛЯ (единый window-обработчик в
// ListingModal — второго листенера Esc не заводим), стрелки ←/→ листают здесь.

import { useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export type LightboxItem = { id: string; kind: string; url: string | null };

export function MediaLightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const item = items[index] ?? items[0];
  const showNav = items.length > 1;

  useEffect(() => {
    if (!showNav) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") onIndexChange((index - 1 + items.length) % items.length);
      if (event.key === "ArrowRight") onIndexChange((index + 1) % items.length);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, items.length, onIndexChange, showNav]);

  return (
    <div aria-label="Просмотр медиа" aria-modal="true" className="mp-lightbox" role="dialog" onClick={onClose}>
      <button aria-label="Закрыть просмотр" className="mp-lightbox-close" type="button" onClick={onClose}>
        <X size={22} />
      </button>
      {showNav ? (
        <button
          aria-label="Предыдущее фото"
          className="mp-lightbox-nav is-prev"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange((index - 1 + items.length) % items.length);
          }}
        >
          <ChevronLeft size={30} />
        </button>
      ) : null}
      <figure className="mp-lightbox-stage" onClick={(event) => event.stopPropagation()}>
        {item?.kind === "video" && item.url ? (
          <video controls playsInline preload="metadata" src={item.url} />
        ) : item?.url ? (
          <img alt="" src={item.url} />
        ) : (
          <div className="mp-lightbox-empty">Файл обрабатывается</div>
        )}
      </figure>
      {showNav ? (
        <button
          aria-label="Следующее фото"
          className="mp-lightbox-nav is-next"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onIndexChange((index + 1) % items.length);
          }}
        >
          <ChevronRight size={30} />
        </button>
      ) : null}
      {showNav ? (
        <span className="mp-lightbox-counter">
          {index + 1} / {items.length}
        </span>
      ) : null}
    </div>
  );
}
