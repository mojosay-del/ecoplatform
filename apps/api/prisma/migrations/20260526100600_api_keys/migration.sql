-- Волна 7.8: модель ApiKey для будущего внешнего API.
-- UI и эндпоинты появятся позже. Сейчас закладываем фундамент, чтобы при
-- подключении внешнего ERP-интегратора не пришлось двигать миграции
-- с реальными ключами на проде.
--
-- Безопасность: храним bcrypt-hash секрета (`keyHash`), не сам секрет.
-- При создании секрет возвращается единожды и больше нигде в БД не лежит.
-- `scopes` — массив строк вида `news:read`, `indices:read` для будущего
-- scope-based авторизатора.

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "ApiKey_companyId_isActive_idx" ON "ApiKey"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
