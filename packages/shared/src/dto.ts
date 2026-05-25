import { z } from "zod";
import { companyTypes, consentSources, legalDocumentTypes, userGenders } from "./domain";

// Единое правило сложности пароля. До этого было три разных:
// register=8, changePassword=10, admin-staff=10. 10 — компромисс между
// безопасностью и обратной совместимостью с существующими паролями.
// Регулярка покрывает кириллицу + латиницу, требует минимум одну букву и одну цифру.
export const MIN_PASSWORD_LENGTH = 10;
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`)
  .regex(/[A-Za-zА-Яа-яЁё]/, "Пароль должен содержать хотя бы одну букву.")
  .regex(/[0-9]/, "Пароль должен содержать хотя бы одну цифру.");

export const registerDtoSchema = z.object({
  organizationName: z.string().trim().min(2),
  companyType: z.enum(companyTypes),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  gender: z.enum(userGenders),
  phone: z
    .string()
    .trim()
    .regex(/^\+7\d{10}$/, "Телефон должен быть в формате +7XXXXXXXXXX"),
  email: z.string().trim().email(),
  password: passwordSchema,
  // ID документов, на которые пользователь явно поставил галочку при
  // регистрации. Бэк проверит, что среди них есть все актуальные обязательные
  // документы; маркетинг — опционально.
  acceptedDocumentIds: z.array(z.string().min(1)).default([]),
});

export type RegisterDto = z.infer<typeof registerDtoSchema>;

export const consentSubmitDtoSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1, "Не указан ни один документ"),
  source: z.enum(consentSources).default("settings"),
});

export type ConsentSubmitDto = z.infer<typeof consentSubmitDtoSchema>;

export const legalDocumentCreateDtoSchema = z.object({
  type: z.enum(legalDocumentTypes),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Версия должна быть в формате semver, например 1.0.0"),
  title: z.string().trim().min(2),
  summary: z.string().trim().max(500).optional(),
  body: z.string().min(1),
  isRequired: z.boolean().default(true),
});

export type LegalDocumentCreateDto = z.infer<typeof legalDocumentCreateDtoSchema>;

export const loginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.boolean().optional(),
});

export type LoginDto = z.infer<typeof loginDtoSchema>;

export const changePasswordDtoSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
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
