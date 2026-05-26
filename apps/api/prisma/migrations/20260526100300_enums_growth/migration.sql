-- Волна 7.5: расширение enum-ов «на вырост».
-- Добавляем категории и каналы для будущих модулей (форум, магазин,
-- отзывы, геолокация, telegram, push) и категории заявок поддержки.
-- Плюс заводим PaymentMethodType и PaymentStatus — модели Payment
-- придут в Волне 7.6.
--
-- PostgreSQL ≥12 умеет добавлять значения в существующий enum внутри
-- одной транзакции (на 11 и младше — нет, но мы на 18-й).

-- CreateEnum
CREATE TYPE "PaymentMethodType" AS ENUM ('card_tinkoff', 'bank_invoice');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- AlterEnum NotificationCategory: новые категории.
ALTER TYPE "NotificationCategory" ADD VALUE 'forum';
ALTER TYPE "NotificationCategory" ADD VALUE 'solutions_shop';
ALTER TYPE "NotificationCategory" ADD VALUE 'reviews';
ALTER TYPE "NotificationCategory" ADD VALUE 'geo_alert';
ALTER TYPE "NotificationCategory" ADD VALUE 'price_alert';

-- AlterEnum NotificationChannel: новые каналы доставки.
ALTER TYPE "NotificationChannel" ADD VALUE 'telegram';
ALTER TYPE "NotificationChannel" ADD VALUE 'push';

-- AlterEnum SupportTicketCategory: новые категории заявок.
ALTER TYPE "SupportTicketCategory" ADD VALUE 'marketplace_dispute';
ALTER TYPE "SupportTicketCategory" ADD VALUE 'forum_complaint';
ALTER TYPE "SupportTicketCategory" ADD VALUE 'shop_purchase';
ALTER TYPE "SupportTicketCategory" ADD VALUE 'refund_request';
