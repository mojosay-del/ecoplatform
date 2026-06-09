import { z } from "zod";

// Входные схемы торговой площадки (Zod). Пока — только пагинация публичной
// ленты; на фазе объявлений сюда добавятся схемы создания/редактирования
// объявления, позиций и медиа.
export const marketplaceListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
