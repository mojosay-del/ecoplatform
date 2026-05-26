import { z } from "zod";
import { resolvePagination } from "../../common/pagination";

export const companyStatusValues = ["demo", "active", "past_due", "suspended", "blocked", "archived"] as const;
export const subscriptionPlanValues = ["basic", "extended"] as const;

export const adminCompanyListQuerySchema = z
  .object({
    status: z.enum(companyStatusValues).optional(),
    plan: z.enum(subscriptionPlanValues).optional(),
    search: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform(({ page, take, ...input }) => ({
    ...input,
    ...resolvePagination({ ...input, page, take }, { defaultLimit: 20, maxLimit: 100 }),
  }));

export const companyStatusChangeReasons = [
  "policy_violation",
  "billing_issue",
  "support_request",
  "manual_activation",
  "manual_archive",
  "other",
] as const;

export const adminCompanyStatusInputSchema = z
  .object({
    status: z.enum(companyStatusValues),
    reasonCode: z.enum(companyStatusChangeReasons),
    comment: z.string().trim().max(500).optional(),
  })
  .superRefine((input, ctx) => {
    if (input.reasonCode === "other" && !input.comment) {
      ctx.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Для причины other нужно указать комментарий.",
      });
    }
  });
