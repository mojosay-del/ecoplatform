import { z } from "zod";

export const moderatedEntityTypes = [
  "news_comment",
  "news_post",
  "knowledge_article",
  "marketplace_listing",
  "marketplace_review",
] as const;
export type ModeratedEntityType = (typeof moderatedEntityTypes)[number];

export const complaintReasonCodes = [
  "contact_data",
  "false_information",
  "offensive_content",
  "spam",
  "illegal_content",
  "other",
] as const;

export const decisionReasonCodes = [
  "valid_complaint",
  "repeated_violation",
  "unfounded_complaint",
  "out_of_scope",
  "severe_violation",
  "other",
] as const;

export const moderationCaseListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform((input) => ({
    ...input,
    limit: input.limit ?? input.take ?? 50,
    offset: input.offset ?? (input.page ? (input.page - 1) * (input.limit ?? input.take ?? 50) : 0),
  }));

export const complaintInputSchema = z
  .object({
    entityType: z.enum(moderatedEntityTypes),
    entityId: z.string().min(1),
    reasonCode: z.enum(complaintReasonCodes),
    comment: z.string().trim().max(500).optional(),
  })
  .superRefine((input, context) => {
    if (input.reasonCode === "other" && !input.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Для причины other нужно указать комментарий.",
      });
    }
  });

export const moderationDecisionInputSchema = z
  .object({
    type: z.enum(["leave_as_is", "remove_content", "warn_company", "escalate_to_admin"]),
    reasonCode: z.enum(decisionReasonCodes),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((input, context) => {
    if (input.reasonCode === "other" && !input.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Для причины other нужно указать комментарий.",
      });
    }
  });

export const adminSanctionTypes = ["user_block", "company_block", "module_restriction"] as const;
export type AdminSanctionType = (typeof adminSanctionTypes)[number];

export const restrictableModuleCodes = ["comments", "marketplace", "reviews"] as const;

export const adminSanctionInputSchema = z
  .object({
    type: z.enum(adminSanctionTypes),
    reasonCode: z.enum(decisionReasonCodes),
    comment: z.string().trim().max(1000).optional(),
    moduleCode: z.enum(restrictableModuleCodes).optional(),
    durationDays: z.number().int().min(1).max(365).optional(),
  })
  .superRefine((input, context) => {
    if (input.reasonCode === "other" && !input.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Для причины other нужно указать комментарий.",
      });
    }
    if (input.type === "module_restriction") {
      if (!input.moduleCode) {
        context.addIssue({
          code: "custom",
          path: ["moduleCode"],
          message: "Для module_restriction нужно указать moduleCode.",
        });
      }
      if (!input.durationDays) {
        context.addIssue({
          code: "custom",
          path: ["durationDays"],
          message: "Для module_restriction нужно указать durationDays.",
        });
      }
    }
  });

export const sanctionLiftInputSchema = z
  .object({
    reasonCode: z.enum(decisionReasonCodes),
    comment: z.string().trim().max(1000).optional(),
  })
  .superRefine((input, context) => {
    if (input.reasonCode === "other" && !input.comment) {
      context.addIssue({
        code: "custom",
        path: ["comment"],
        message: "Для причины other нужно указать комментарий.",
      });
    }
  });
