import { z } from "zod";

export const moderatedEntityTypes = ["news_comment", "news_post", "knowledge_article"] as const;
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
