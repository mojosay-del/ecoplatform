import { z } from "zod";
import { companyTypes, subscriptionPlans, userGenders } from "@ecoplatform/shared";

// Аудитория рассылки: все фильтры опциональны (пусто = «не сужать по этому
// признаку»). По умолчанию заблокированных пользователей не трогаем.
export const broadcastAudienceSchema = z
  .object({
    companyType: z.enum(companyTypes).optional(),
    subscriptionPlan: z.enum(subscriptionPlans).optional(),
    gender: z.enum(userGenders).optional(),
    companyRole: z.enum(["owner", "member"]).optional(),
    includeBlocked: z.boolean().optional(),
  })
  .default({});

export const broadcastRecipientsQuerySchema = z.object({
  audience: broadcastAudienceSchema,
});

export const broadcastSendInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(2000),
  link: z.string().trim().max(500).optional(),
  audience: broadcastAudienceSchema,
});
