import { z } from "zod";
import { MIN_PASSWORD_LENGTH, passwordSchema, userGenders } from "@ecoplatform/shared";
import { resolvePagination } from "../../common/pagination";

export const platformRoleSchema = z.enum(["admin", "moderator", "content_manager"]);

export const adminStaffListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(100).optional(),
  })
  .transform(({ page, take, ...input }) =>
    resolvePagination({ ...input, page, take }, { defaultLimit: 30, maxLimit: 100 }),
  );

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
  gender: z.enum(userGenders).nullable().optional(),
  // Делегируем общей passwordSchema, чтобы политика не разошлась.
  // Дополнительно max(120) против DoS на bcrypt (он линейно растёт).
  password: passwordSchema.max(120, `Пароль должен быть короче 120 символов.`),
  roles: z.array(platformRoleSchema).min(1),
});
// Re-export для admin-UI: чтобы фронт показывал тот же минимум.
export { MIN_PASSWORD_LENGTH };

export const adminStaffUpdateInputSchema = z
  .object({
    roles: z.array(platformRoleSchema).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((input) => input.roles !== undefined || input.isActive !== undefined, {
    message: "Нужно указать roles или isActive.",
  });
