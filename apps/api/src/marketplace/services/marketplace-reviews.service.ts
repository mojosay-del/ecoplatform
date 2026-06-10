import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { NotificationCategory, Prisma } from "@prisma/client";
import {
  type CompanyRatingCriterion,
  type CompanyRatingSummary,
  type CreateReviewDto,
  REVIEW_CRITERIA_BY_DIRECTION,
  type ReviewDirection,
  type ReviewItem,
  type ReviewResponseDto,
  canOpenFunctionalSections,
} from "@ecoplatform/shared";
import type { RequestUser } from "../../common/request-user";
import { swallowAndLog } from "../../common/silent-catch";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { reviewInclude, reviewOverall, round2, toReviewItem } from "./marketplace-reviews.helpers";

const EDIT_WINDOW_MS = 3 * 60 * 1000;
const RESPONSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const RATING_STARTER = 5;

// Сервис отзывов и рейтинга. Отзыв — по состоявшейся сделке (Offer dealResult=
// agreed), обе стороны оценивают друг друга по направленным критериям. Рейтинг
// компании кэшируется (Яндекс-модель: служебный старт-5★ как один доп. балл).
@Injectable()
export class MarketplaceReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private assertCanUse(user: RequestUser) {
    if (user.platformRoles.length > 0) return;
    if (!user.company || !canOpenFunctionalSections(user.company)) {
      throw new ForbiddenException("Доступ к площадке ограничен. Активируйте подписку в кабинете.");
    }
  }

  async createReview(user: RequestUser, offerId: string, dto: CreateReviewDto): Promise<ReviewItem> {
    this.assertCanUse(user);
    if (!user.companyId) {
      throw new ForbiddenException("Действие доступно только компаниям.");
    }

    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, dealResult: true, buyerCompanyId: true, listing: { select: { sellerCompanyId: true } } },
    });
    if (!offer) {
      throw new NotFoundException("Сделка не найдена.");
    }
    if (offer.dealResult !== "agreed") {
      throw new BadRequestException("Отзыв можно оставить только по состоявшейся сделке.");
    }

    const isSeller = offer.listing.sellerCompanyId === user.companyId;
    const isBuyer = offer.buyerCompanyId === user.companyId;
    if (!isSeller && !isBuyer) {
      throw new ForbiddenException("Вы не участник этой сделки.");
    }

    const direction: ReviewDirection = isSeller ? "seller_to_buyer" : "buyer_to_seller";
    const toCompanyId = isSeller ? offer.buyerCompanyId : offer.listing.sellerCompanyId;
    this.assertScores(direction, dto.scores);

    const existing = await this.prisma.marketplaceReview.findUnique({
      where: { offerId_direction: { offerId, direction } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("Вы уже оставили отзыв по этой сделке.");
    }

    const now = new Date();
    const review = await this.prisma.marketplaceReview.create({
      data: {
        offerId,
        direction,
        fromCompanyId: user.companyId,
        toCompanyId,
        createdById: user.id,
        comment: dto.comment?.trim() || null,
        status: "published",
        editableUntil: new Date(now.getTime() + EDIT_WINDOW_MS),
        scores: { create: dto.scores.map((score) => ({ criterion: score.criterion, score: score.score })) },
      },
      include: reviewInclude,
    });

    await this.recomputeCompanyRating(toCompanyId);
    await this.notifyCompanyOwner(
      toCompanyId,
      "marketplace.review.received",
      "Новый отзыв",
      "О вашей компании оставили отзыв на площадке.",
      review.id,
    );
    return toReviewItem(review, { companyId: user.companyId });
  }

  // Автор может удалить свой отзыв в течение 3 минут; позже — только модератор.
  async deleteOwnReview(user: RequestUser, reviewId: string): Promise<{ ok: true }> {
    this.assertCanUse(user);
    const review = await this.prisma.marketplaceReview.findUnique({
      where: { id: reviewId },
      select: { id: true, fromCompanyId: true, toCompanyId: true, editableUntil: true },
    });
    if (!review) {
      throw new NotFoundException("Отзыв не найден.");
    }
    if (review.fromCompanyId !== user.companyId) {
      throw new ForbiddenException("Это не ваш отзыв.");
    }
    if (review.editableUntil.getTime() < Date.now()) {
      throw new BadRequestException("Окно изменения истекло (3 минуты). Снятие отзыва — только через жалобу модератору.");
    }
    await this.prisma.marketplaceReview.delete({ where: { id: reviewId } });
    await this.recomputeCompanyRating(review.toCompanyId);
    return { ok: true };
  }

  async respondToReview(user: RequestUser, reviewId: string, dto: ReviewResponseDto): Promise<ReviewItem> {
    this.assertCanUse(user);
    const review = await this.prisma.marketplaceReview.findUnique({ where: { id: reviewId }, include: reviewInclude });
    if (!review) {
      throw new NotFoundException("Отзыв не найден.");
    }
    if (review.toCompanyId !== user.companyId) {
      throw new ForbiddenException("Ответить может только адресат отзыва.");
    }
    if (review.response) {
      throw new BadRequestException("Ответ на отзыв уже оставлен.");
    }
    if (Date.now() - review.createdAt.getTime() >= RESPONSE_WINDOW_MS) {
      throw new BadRequestException("Срок ответа истёк (30 дней).");
    }

    await this.prisma.marketplaceReviewResponse.create({
      data: { reviewId, createdById: user.id, text: dto.text.trim() },
    });
    const updated = await this.prisma.marketplaceReview.findUniqueOrThrow({ where: { id: reviewId }, include: reviewInclude });
    await this.notifyCompanyOwner(
      review.fromCompanyId,
      "marketplace.review.answered",
      "Ответ на ваш отзыв",
      "На ваш отзыв на площадке оставили публичный ответ.",
      reviewId,
    );
    return toReviewItem(updated, { companyId: user.companyId });
  }

  async getCompanyReviews(user: RequestUser, companyId: string): Promise<ReviewItem[]> {
    this.assertCanUse(user);
    const reviews = await this.prisma.marketplaceReview.findMany({
      where: { toCompanyId: companyId, status: "published" },
      orderBy: { createdAt: "desc" },
      include: reviewInclude,
    });
    return reviews.map((review) => toReviewItem(review, { companyId: user.companyId ?? null }));
  }

  async getCompanyRating(companyId: string): Promise<CompanyRatingSummary> {
    const rating = await this.prisma.companyMarketplaceRating.findUnique({ where: { companyId } });
    if (!rating || rating.reviewCount === 0) {
      return { overall: null, reviewCount: 0, byCriterion: [] };
    }
    return {
      overall: Number(rating.overall),
      reviewCount: rating.reviewCount,
      byCriterion: this.parseByCriterion(rating.byCriterion),
    };
  }

  // Пересчёт кэша рейтинга компании по опубликованным отзывам. Яндекс-модель:
  // overall = (старт-5★ + сумма «общих баллов» отзывов) / (кол-во + 1).
  async recomputeCompanyRating(companyId: string): Promise<void> {
    const reviews = await this.prisma.marketplaceReview.findMany({
      where: { toCompanyId: companyId, status: "published" },
      select: { scores: { select: { criterion: true, score: true } } },
    });
    const reviewCount = reviews.length;
    const overallSum = reviews.reduce((sum, review) => sum + reviewOverall(review.scores), 0);
    const overall = (RATING_STARTER + overallSum) / (reviewCount + 1);

    const acc: Record<string, { sum: number; count: number }> = {};
    for (const review of reviews) {
      for (const score of review.scores) {
        const entry = (acc[score.criterion] ??= { sum: 0, count: 0 });
        entry.sum += score.score;
        entry.count += 1;
      }
    }
    const byCriterion: Record<string, { avg: number; count: number }> = {};
    for (const [criterion, value] of Object.entries(acc)) {
      byCriterion[criterion] = { avg: round2(value.sum / value.count), count: value.count };
    }

    const data = {
      overall: new Prisma.Decimal(round2(overall)),
      reviewCount,
      byCriterion: byCriterion as Prisma.InputJsonValue,
    };
    await this.prisma.companyMarketplaceRating.upsert({
      where: { companyId },
      create: { companyId, ...data },
      update: data,
    });
  }

  private assertScores(direction: ReviewDirection, scores: { criterion: string }[]) {
    const expected = REVIEW_CRITERIA_BY_DIRECTION[direction];
    const provided = scores.map((score) => score.criterion);
    const set = new Set(provided);
    if (set.size !== provided.length) {
      throw new BadRequestException("В отзыве есть дублирующиеся критерии.");
    }
    if (set.size !== expected.length || !expected.every((criterion) => set.has(criterion))) {
      throw new BadRequestException("Набор критериев не соответствует роли — оцените все критерии.");
    }
  }

  private parseByCriterion(value: Prisma.JsonValue): CompanyRatingCriterion[] {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    return Object.entries(value as Record<string, { avg: number; count: number }>).map(([criterion, entry]) => ({
      criterion: criterion as CompanyRatingCriterion["criterion"],
      average: entry.avg,
      count: entry.count,
    }));
  }

  private async notifyCompanyOwner(companyId: string, eventType: string, title: string, body: string, sourceId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { companyId, companyRole: "owner" },
      select: { id: true },
    });
    const userId = owner?.id ?? (await this.prisma.user.findFirst({ where: { companyId }, select: { id: true } }))?.id;
    if (!userId) return;
    await this.notifications
      .createInApp({
        userId,
        eventType,
        category: NotificationCategory.reviews,
        title,
        body,
        link: "/marketplace/offers",
        sourceId,
      })
      .catch(swallowAndLog(eventType, { companyId, sourceId }));
  }
}
