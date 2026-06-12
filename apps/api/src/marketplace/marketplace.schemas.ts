import { z } from "zod";

// Значение query-параметра-массива: Express отдаёт `?region=a&region=b` как
// массив, `?region=a` как строку. Принимаем оба + форму `region[]=...`.
const stringArrayQueryValue = z.union([z.string(), z.array(z.string())]).optional();

function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export type MarketplaceFeedBbox = { south: number; west: number; north: number; east: number };

// Видимая область карты для «Искать в этой области»: `swLat,swLon,neLat,neLon`.
// west > east допустим — окно пересекает антимеридиан (сервис строит OR-ветку).
const bboxQueryValue = z
  .string()
  .regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, "bbox: swLat,swLon,neLat,neLon")
  .refine((value) => {
    const [south, west, north, east] = value.split(",").map(Number);
    return (
      Math.abs(south!) <= 90 && Math.abs(north!) <= 90 && Math.abs(west!) <= 180 && Math.abs(east!) <= 180 && south! <= north!
    );
  }, "bbox вне диапазона координат")
  .optional();

function parseBbox(value: string | undefined): MarketplaceFeedBbox | undefined {
  if (!value) return undefined;
  const [south, west, north, east] = value.split(",").map(Number);
  return { south: south!, west: west!, north: north!, east: east! };
}

// Входная схема ленты площадки: пагинация + фильтры по региону, номенклатуре
// (сырью) и видимой области карты. Фильтры опциональны; их выставляет UI.
export const marketplaceListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    region: stringArrayQueryValue,
    "region[]": stringArrayQueryValue,
    nomenclatureId: stringArrayQueryValue,
    "nomenclatureId[]": stringArrayQueryValue,
    bbox: bboxQueryValue,
  })
  .transform((query) => ({
    limit: query.limit,
    offset: query.offset,
    region: [...toStringArray(query.region), ...toStringArray(query["region[]"])],
    nomenclatureId: [...toStringArray(query.nomenclatureId), ...toStringArray(query["nomenclatureId[]"])],
    bbox: parseBbox(query.bbox),
  }));
