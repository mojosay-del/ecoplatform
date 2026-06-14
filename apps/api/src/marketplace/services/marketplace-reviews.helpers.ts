import { Prisma } from "@prisma/client";
import { type ReviewItem, type ReviewScoreView } from "@ecoplatform/shared";

export const reviewInclude = {
  scores: true,
  response: true,
  fromCompany: { select: { organizationName: true } },
} satisfies Prisma.MarketplaceReviewInclude;

export type ReviewWithRelations = Prisma.MarketplaceReviewGetPayload<{ include: typeof reviewInclude }>;

const RESPONSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Общий балл отзыва — среднее по его критериям.
export function reviewOverall(scores: { score: number }[]): number {
  if (scores.length === 0) return 0;
  return round2(scores.reduce((sum, score) => sum + score.score, 0) / scores.length);
}

export function toReviewItem(
  review: ReviewWithRelations,
  viewer: { companyId: string | null },
  now = new Date(),
): ReviewItem {
  const isAuthor = viewer.companyId === review.fromCompanyId;
  const isRecipient = viewer.companyId === review.toCompanyId;
  const withinResponseWindow = now.getTime() - review.createdAt.getTime() < RESPONSE_WINDOW_MS;
  return {
    id: review.id,
    offerId: review.offerId,
    direction: review.direction,
    fromCompanyName: review.fromCompany.organizationName,
    toCompanyId: review.toCompanyId,
    comment: review.comment,
    status: review.status,
    scores: review.scores.map((score): ReviewScoreView => ({ criterion: score.criterion, score: score.score })),
    overall: reviewOverall(review.scores),
    response: review.response
      ? { text: review.response.text, createdAt: review.response.createdAt.toISOString() }
      : null,
    editableUntil: review.editableUntil.toISOString(),
    canRespond: isRecipient && review.response === null && withinResponseWindow,
    isAuthor,
    createdAt: review.createdAt.toISOString(),
  };
}
