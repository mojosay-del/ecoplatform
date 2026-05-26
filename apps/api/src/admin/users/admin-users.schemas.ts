import { z } from "zod";
import { resolvePagination } from "../../common/pagination";

export const userStatusFilter = z.enum(["active", "blocked"]).optional();

export const adminUserListQuerySchema = z
  .object({
    status: userStatusFilter,
    companyId: z.string().min(1).optional(),
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
