import { z } from "zod";

export const userStatusFilter = z.enum(["active", "blocked"]).optional();

export const adminUserListQuerySchema = z.object({
  status: userStatusFilter,
  companyId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

export const blockReasonCodes = [
  "policy_violation",
  "fraud",
  "suspicious_activity",
  "support_request",
  "other",
] as const;

export const adminUserBlockInputSchema = z
  .object({
    reasonCode: z.enum(blockReasonCodes),
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

export const adminUserUnblockInputSchema = z.object({
  comment: z.string().trim().max(500).optional(),
});

export const platformRoleSchema = z.enum(["admin", "moderator", "content_manager"]);

export const adminUserPlatformRolesInputSchema = z.object({
  roles: z.array(platformRoleSchema),
  isActive: z.boolean().optional(),
});
