/**
 * Одноразовый идемпотентный бэкофилл координат фактических адресов компаний.
 *
 * Зачем: сортировка marketplace «Ближе ко мне» берёт координаты из
 * Company.factualAddress. Старые адреса могли быть сохранены до геокодинга.
 *
 * Запуск dry-run (из apps/api):
 *   ts-node scripts/backfill-company-address-geocodes.ts
 *
 * Запуск с записью:
 *   BACKFILL_COMPANY_ADDRESS_GEOCODES_WRITE=1 ts-node scripts/backfill-company-address-geocodes.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { AddressGeocoderService, dadataCountryFromName } from "../src/geo/address-geocoder.service";

loadEnv({ path: resolve(__dirname, "../../../.env") });

async function main() {
  const writeEnabled = process.env.BACKFILL_COMPANY_ADDRESS_GEOCODES_WRITE === "1";
  const prisma = new PrismaClient();
  const geocoder = new AddressGeocoderService();

  const addresses = await prisma.address.findMany({
    where: {
      companyAsFactual: { isNot: null },
      OR: [{ latitude: null }, { longitude: null }],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      formatted: true,
      region: true,
      country: true,
      companyAsFactual: { select: { id: true, organizationName: true } },
    },
  });

  let updated = 0;
  let skipped = 0;

  for (const address of addresses) {
    process.stdout.write(`Геокодирую ${address.companyAsFactual?.organizationName ?? address.id}... `);
    const result = await geocoder.geocode(address.formatted, dadataCountryFromName(address.country));
    if (!result) {
      skipped += 1;
      process.stdout.write("нет результата\n");
      continue;
    }

    if (writeEnabled) {
      await prisma.address.update({
        where: { id: address.id },
        data: {
          latitude: new Prisma.Decimal(result.lat),
          longitude: new Prisma.Decimal(result.lon),
          region: address.region ?? result.region,
        },
      });
    }

    updated += 1;
    process.stdout.write(writeEnabled ? "записано\n" : "найдено, dry-run\n");
  }

  console.log(
    `\nИтого: адресов без координат ${addresses.length}, ` +
      `${writeEnabled ? "обновлено" : "готово к обновлению"} ${updated}, ` +
      `без результата ${skipped}.`,
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
