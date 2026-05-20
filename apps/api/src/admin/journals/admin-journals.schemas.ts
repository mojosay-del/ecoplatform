import { z } from "zod";

export const adminJournalsQuerySchema = z
  .object({
    action: z.string().trim().min(1).max(120).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    actorId: z.string().trim().min(1).max(80).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    page: z.coerce.number().int().min(1).default(1),
    take: z.coerce.number().int().min(1).max(100).default(20),
  })
  .superRefine((input, ctx) => {
    if (input.from && input.to && input.from > input.to) {
      ctx.addIssue({
        code: "custom",
        path: ["from"],
        message: "from должно быть не позже to.",
      });
    }
  });
