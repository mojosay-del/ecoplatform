"use client";

// Примитивы отзывов: подписи критериев, звёзды (показ и ввод), бейдж рейтинга.

import type { ReviewCriterion } from "@ecoplatform/shared";

export const REVIEW_CRITERION_LABEL: Record<ReviewCriterion, string> = {
  quality: "Качество / соответствие",
  weight_accuracy: "Точность веса",
  shipping_speed: "Скорость отгрузки",
  payment_speed: "Скорость оплаты",
  terms_adherence: "Соблюдение договорённостей",
  reliability: "Надёжность и связь",
};

export function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="mp-stars" aria-label={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? "mp-star on" : "mp-star"}>
          ★
        </span>
      ))}
    </span>
  );
}

export function RatingBadge({ overall, count }: { overall: number | null; count: number }) {
  if (overall == null) {
    return <span className="mp-rating-empty">Рейтинг отсутствует</span>;
  }
  return (
    <span className="mp-rating-badge">
      <strong>{overall.toFixed(1)}</strong>
      <Stars value={overall} />
      <span className="mp-hint">({count})</span>
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <span className="mp-star-input">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={n <= value ? "mp-star on" : "mp-star"}
          onClick={() => onChange(n)}
          aria-label={`${n} из 5`}
        >
          ★
        </button>
      ))}
    </span>
  );
}
