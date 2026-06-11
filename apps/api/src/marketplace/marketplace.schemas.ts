import { z } from "zod";

// Значение query-параметра-массива: Express отдаёт `?region=a&region=b` как
// массив, `?region=a` как строку. Принимаем оба + форму `region[]=...`.
const stringArrayQueryValue = z.union([z.string(), z.array(z.string())]).optional();

function toStringArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

// Входная схема ленты площадки: пагинация + фильтры по региону и номенклатуре
// (сырью). Фильтры опциональны; на фазе карты их выставляет UI.
export const marketplaceListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    region: stringArrayQueryValue,
    "region[]": stringArrayQueryValue,
    nomenclatureId: stringArrayQueryValue,
    "nomenclatureId[]": stringArrayQueryValue,
  })
  .transform((query) => ({
    limit: query.limit,
    offset: query.offset,
    region: [...toStringArray(query.region), ...toStringArray(query["region[]"])],
    nomenclatureId: [...toStringArray(query.nomenclatureId), ...toStringArray(query["nomenclatureId[]"])],
  }));
