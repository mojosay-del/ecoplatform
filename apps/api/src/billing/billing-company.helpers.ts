import { Prisma } from "@prisma/client";
import type { AddressDto } from "@ecoplatform/shared";

// Пустую строку из формы трактуем как «очистить». Trim'аем заранее в Zod-схеме,
// поэтому здесь только пробрасываем undefined/null/непустую строку.
export function normaliseOptionalString(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// Если у Company уже есть Address — обновляем строку (адрес меняется, id остаётся);
// иначе создаём новую. Если входной address=null — возвращаем null (Company.update
// сделает disconnect; orphaned Address остаётся в БД до отдельной очистки, потому
// что в будущем эту запись могут переиспользовать).
export async function upsertCompanyAddress(
  tx: Prisma.TransactionClient,
  existingAddressId: string | null,
  address: AddressDto | null | undefined,
): Promise<string | null> {
  if (!address) {
    return null;
  }

  const formatted = address.formatted?.trim() || composeFormattedAddress(address);
  const data = {
    country: address.country?.trim() || "Россия",
    region: address.region?.trim() || null,
    city: address.city.trim(),
    street: address.street?.trim() || null,
    building: address.building?.trim() || null,
    apartment: address.apartment?.trim() || null,
    postcode: address.postcode?.trim() || null,
    formatted,
    source: "manual",
  };

  if (existingAddressId) {
    const updated = await tx.address.update({ where: { id: existingAddressId }, data });
    return updated.id;
  }
  const created = await tx.address.create({ data });
  return created.id;
}

// Собирает одну строку адреса из полей. Используется когда пользователь
// не указал `formatted` явно. Порядок — как принято в России:
// индекс, регион, город, улица, дом, квартира.
export function composeFormattedAddress(address: AddressDto): string {
  const parts = [
    address.postcode,
    address.region,
    address.city,
    address.street ? `ул. ${address.street}` : null,
    address.building ? `д. ${address.building}` : null,
    address.apartment ? `кв. ${address.apartment}` : null,
  ]
    .map((part) => part?.toString().trim())
    .filter((part): part is string => Boolean(part));
  return parts.join(", ");
}
