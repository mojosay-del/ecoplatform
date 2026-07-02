"use client";

// Форма отзыва: звёзды по направленным критериям + комментарий. Направление
// (кто кого оценивает) задаёт вызывающий компонент (покупатель/продавец).

import { useState } from "react";
import type { CreateReviewDto, ReviewDirection } from "@ecoplatform/shared";
import { REVIEW_CRITERIA_BY_DIRECTION } from "@ecoplatform/shared";
import { SendActionIcon } from "../../components/app-shell/nav-icons";
import { ApiError, api } from "../../lib/api";
import { REVIEW_CRITERION_LABEL, StarInput } from "./review-ui";

export function ReviewForm({
  offerId,
  direction,
  onDone,
}: {
  offerId: string;
  direction: ReviewDirection;
  onDone: () => void;
}) {
  const criteria = REVIEW_CRITERIA_BY_DIRECTION[direction];
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (criteria.some((criterion) => !scores[criterion])) {
      setError("Оцените все критерии.");
      return;
    }
    setSaving(true);
    try {
      const dto: CreateReviewDto = {
        scores: criteria.map((criterion) => ({ criterion, score: scores[criterion]! })),
        comment: comment.trim() || null,
        isAnonymous: anonymous,
      };
      await api.marketplace.reviews.create(offerId, dto);
      onDone();
    } catch (submitError) {
      setError(submitError instanceof ApiError ? submitError.message : "Не удалось отправить отзыв.");
      setSaving(false);
    }
  }

  return (
    <div className="mp-review-form">
      <h4>Оставить отзыв</h4>
      {criteria.map((criterion) => (
        <div className="mp-review-criterion" key={criterion}>
          <span>{REVIEW_CRITERION_LABEL[criterion]}</span>
          <StarInput
            value={scores[criterion] ?? 0}
            onChange={(value) => setScores((prev) => ({ ...prev, [criterion]: value }))}
          />
        </div>
      ))}
      <textarea
        className="mp-input"
        rows={2}
        placeholder="Комментарий (необязательно)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      <label className="mp-review-anon">
        <input type="checkbox" checked={anonymous} onChange={(event) => setAnonymous(event.target.checked)} />
        <span>Оставить анонимно — компания и имя не видны на площадке (админам при жалобах видно)</span>
      </label>
      {error ? <p className="mp-error">{error}</p> : null}
      <button className="button" type="button" disabled={saving} onClick={submit}>
        <SendActionIcon size={18} />
        Отправить отзыв
      </button>
    </div>
  );
}
