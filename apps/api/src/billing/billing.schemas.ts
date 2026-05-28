import { z } from "zod";
import { resolvePagination } from "../common/pagination";

export const adminBillingCompaniesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(200).optional(),
  })
  .transform(({ page, take, ...input }) =>
    resolvePagination({ ...input, page, take }, { defaultLimit: 50, maxLimit: 200 }),
  );
