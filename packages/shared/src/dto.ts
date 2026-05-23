import { z } from "zod";
import { companyTypes, userGenders } from "./domain";

export const registerDtoSchema = z.object({
  organizationName: z.string().trim().min(2),
  companyType: z.enum(companyTypes),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  gender: z.enum(userGenders),
  phone: z.string().trim().regex(/^\+7\d{10}$/, "Телефон должен быть в формате +7XXXXXXXXXX"),
  email: z.string().trim().email(),
  password: z.string().min(8).regex(/[A-Za-zА-Яа-яЁё]/).regex(/[0-9]/),
});

export type RegisterDto = z.infer<typeof registerDtoSchema>;

export const loginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export type LoginDto = z.infer<typeof loginDtoSchema>;

export const changePasswordDtoSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).regex(/[A-Za-zА-Яа-яЁё]/).regex(/[0-9]/),
});

export type ChangePasswordDto = z.infer<typeof changePasswordDtoSchema>;

export const manualSubscriptionDtoSchema = z.object({
  companyId: z.string().min(1),
  plan: z.enum(["basic", "extended"]),
  endsAt: z.string().datetime(),
  reason: z.string().min(3),
});

export type ManualSubscriptionDto = z.infer<typeof manualSubscriptionDtoSchema>;

export const supportTicketDtoSchema = z.object({
  category: z.enum(["billing", "moderation_review", "company_management", "technical", "data_deletion", "other"]),
  subject: z.string().min(3),
  text: z.string().min(3),
});

export type SupportTicketDto = z.infer<typeof supportTicketDtoSchema>;
