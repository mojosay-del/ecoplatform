import { z } from "zod";
import { resolvePagination } from "../../common/pagination";

export const adminJournalsQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    actorId: z.string().trim().min(1).max(80).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.from && input.to && input.from > input.to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "from должно быть не позже to.",
      });
    }
  })
  .transform(({ page, take, ...input }) => ({
    ...input,
    ...resolvePagination({ ...input, page, take }, { defaultLimit: 20, maxLimit: 100 }),
  }));
