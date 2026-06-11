-- Prisma schema cannot express partial unique indexes yet, so these guards live
-- in SQL. They close races that app-level findFirst + create/update cannot.

CREATE UNIQUE INDEX "Offer_buyerCompanyId_listingId_active_key"
ON "Offer"("buyerCompanyId", "listingId")
WHERE "status" IN ('active', 'accepted');

CREATE UNIQUE INDEX "Offer_listingId_accepted_key"
ON "Offer"("listingId")
WHERE "status" = 'accepted';
