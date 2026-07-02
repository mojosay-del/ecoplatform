-- Анонимные отзывы площадки: компания и ФИО автора скрыты в публичной ленте,
-- но видны админам при разборе жалоб (через сущность модерации).
ALTER TABLE "MarketplaceReview" ADD COLUMN "isAnonymous" BOOLEAN NOT NULL DEFAULT false;
