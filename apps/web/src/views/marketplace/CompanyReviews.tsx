"use client";

// Блок рейтинга и отзывов о компании: сводка (общий балл + по критериям) и лента
// опубликованных отзывов. Адресат отзыва может оставить один публичный ответ.

import { useState } from "react";
import type { CompanyRatingSummary, ReviewItem } from "@ecoplatform/shared";
import { ApiError, api } from "../../lib/api";
import { useApiQuery } from "../shared";
import { REVIEW_CRITERION_LABEL, RatingBadge, Stars } from "./review-ui";

export function CompanyReviews({ companyId }: { companyId: string }) {
  const [refresh, setRefresh] = useState(0);
  const { data: rating } = useApiQuery(
    `company-rating-${companyId}-${refresh}`,
    () => api.marketplace.reviews.rating(companyId),
    { overall: null, reviewCount: 0, byCriterion: [] } as CompanyRatingSummary,
  );
  const { data: reviews, state } = useApiQuery(
    `company-reviews-${companyId}-${refresh}`,
    () => api.marketplace.reviews.forCompany(companyId),
    [] as ReviewItem[],
  );
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function respond(reviewId: string) {
    setError(null);
    try {
      await api.marketplace.reviews.respond(reviewId, responseText.trim());
      setRespondingId(null);
      setResponseText("");
      setRefresh((value) => value + 1);
    } catch (respondError) {
      setError(respondError instanceof ApiError ? respondError.message : "Не удалось ответить.");
    }
  }

  return (
    <div className="mp-reviews">
      <div className="mp-rating-head">
        <h3>Рейтинг и отзывы</h3>
        <RatingBadge overall={rating.overall} count={rating.reviewCount} />
      </div>

      {rating.byCriterion.length > 0 ? (
        <ul className="mp-rating-criteria">
          {rating.byCriterion.map((criterion) => (
            <li key={criterion.criterion}>
              {REVIEW_CRITERION_LABEL[criterion.criterion]}: <strong>{criterion.average.toFixed(1)}</strong>{" "}
              <span className="mp-hint">({criterion.count})</span>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="mp-error">{error}</p> : null}
      {state === "ready" && reviews.length === 0 ? <p className="mp-hint">Отзывов пока нет.</p> : null}

      {reviews.map((review) => (
        <div className="mp-review" key={review.id}>
          <div className="mp-review-head">
            <Stars value={review.overall} />
            <strong>{review.overall.toFixed(1)}</strong>
            <span className="mp-hint">· {review.fromCompanyName}</span>
          </div>
          {review.comment ? <p className="mp-review-comment">{review.comment}</p> : null}
          {review.response ? <p className="mp-review-response">Ответ компании: {review.response.text}</p> : null}
          {review.canRespond ? (
            respondingId === review.id ? (
              <div className="mp-review-respond">
                <textarea
                  className="mp-input"
                  rows={2}
                  placeholder="Ваш ответ"
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                />
                <button className="button secondary" type="button" onClick={() => respond(review.id)}>
                  Ответить
                </button>
              </div>
            ) : (
              <button className="button ghost" type="button" onClick={() => setRespondingId(review.id)}>
                Ответить на отзыв
              </button>
            )
          ) : null}
        </div>
      ))}
    </div>
  );
}
