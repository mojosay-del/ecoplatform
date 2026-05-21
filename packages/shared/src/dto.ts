import { z } from "zod";

export const registerDtoSchema = z.object({
  organizationName: z.string().min(2),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email(),
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
