import { z } from "zod";

export const platformRoleSchema = z.enum(["admin", "moderator", "content_manager"]);

export const adminStaffCreateInputSchema = z.object({
  email: z.string().trim().email().max(255),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(32)
    .regex(/^\+?[0-9 ()-]+$/, "Телефон должен содержать только цифры и допустимые символы."),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  password: z.string().min(10).max(120),
  roles: z.array(platformRoleSchema).min(1),
});

export const adminStaffUpdateInputSchema = z
  .object({
    roles: z.array(platformRoleSchema).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => input.roles !== undefined || input.isActive !== undefined, {
    message: "Нужно указать roles или isActive.",
  });
