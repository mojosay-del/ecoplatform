import { z } from "zod";

export const seoPageQuerySchema = z.object({
  path: z.string().trim().min(1).max(512),
});
