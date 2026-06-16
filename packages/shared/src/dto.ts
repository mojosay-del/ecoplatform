import { z } from "zod";
import {
  companyTypes,
  consentSources,
  dealResults,
  legalDocumentTypes,
  listingContaminationConditions,
  listingMoistureConditions,
  listingPositionForms,
  priceConditions,
  reviewCriteria,
  userGenders,
} from "./domain";

// Единое правило сложности пароля для новых паролей.
// Регулярка покрывает кириллицу + латиницу, требует минимум одну букву и одну цифру.
export const MIN_PASSWORD_LENGTH = 12;
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов.`)
  .regex(/[A-Za-zА-Яа-яЁё]/, "Пароль должен содержать хотя бы одну букву.")
  .regex(/[0-9]/, "Пароль должен содержать хотя бы одну цифру.");

export const registerDtoSchema = z.object({
  organizationName: z.string().trim().min(2),
  companyType: z.enum(companyTypes),
  billingInn: z.never({ error: "ИНН заполняется в профиле компании после регистрации." }).optional(),
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, "Телефон должен быть в международном формате, например +79991234567"),
  email: z.string().trim().email(),
  password: passwordSchema,
  // ID документов, на которые пользователь явно поставил галочку при
  // регистрации. Бэк проверит, что среди них есть все актуальные обязательные
  // документы; маркетинг — опционально.
  acceptedDocumentIds: z.array(z.string().min(1)).default([]),
});

export type RegisterDto = z.infer<typeof registerDtoSchema>;

export const accountProfileUpdateDtoSchema = z.object({
  gender: z.enum(userGenders).nullable(),
});

export type AccountProfileUpdateDto = z.infer<typeof accountProfileUpdateDtoSchema>;

export const registrationVerifyDtoSchema = z.object({
  verificationId: z.string().trim().min(1),
  code: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Код подтверждения должен состоять из 4 цифр."),
});

export type RegistrationVerifyDto = z.infer<typeof registrationVerifyDtoSchema>;

export const consentSubmitDtoSchema = z.object({
  documentIds: z.array(z.string().min(1)).min(1, "Не указан ни один документ"),
  source: z.enum(consentSources).default("settings"),
});

export type ConsentSubmitDto = z.infer<typeof consentSubmitDtoSchema>;

export const LEGAL_DOCUMENT_TITLE_MAX_LENGTH = 200;
export const LEGAL_DOCUMENT_BODY_MAX_LENGTH = 100_000;

export const legalDocumentCreateDtoSchema = z.object({
  type: z.enum(legalDocumentTypes),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Версия должна быть в формате semver, например 1.0.0"),
  title: z
    .string()
    .trim()
    .min(2)
    .max(LEGAL_DOCUMENT_TITLE_MAX_LENGTH, {
      error: `Название не длиннее ${LEGAL_DOCUMENT_TITLE_MAX_LENGTH} символов.`,
    }),
  summary: z.string().trim().max(500).optional(),
  body: z
    .string()
    .min(1)
    .max(LEGAL_DOCUMENT_BODY_MAX_LENGTH, { error: `Текст не длиннее ${LEGAL_DOCUMENT_BODY_MAX_LENGTH} символов.` }),
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

const futureDateTimeSchema = z
  .string()
  .datetime()
  .refine(
    (value) => {
      const timestamp = Date.parse(value);
      return Number.isFinite(timestamp) && timestamp > Date.now();
    },
    { message: "Дата окончания подписки должна быть в будущем." },
  );

export const manualSubscriptionDtoSchema = z.object({
  companyId: z.string().min(1),
  plan: z.enum(["basic", "extended"]),
  endsAt: futureDateTimeSchema,
  reason: z.string().min(3),
});

export type ManualSubscriptionDto = z.infer<typeof manualSubscriptionDtoSchema>;

export const selfSubscriptionDtoSchema = z.object({
  plan: z.enum(["basic", "extended"]),
});

export type SelfSubscriptionDto = z.infer<typeof selfSubscriptionDtoSchema>;

export const SUPPORT_TICKET_SUBJECT_MAX_LENGTH = 160;
export const SUPPORT_TICKET_MESSAGE_MAX_LENGTH = 4000;

export const supportTicketDtoSchema = z.object({
  category: z.enum(["billing", "moderation_review", "company_management", "technical", "data_deletion", "other"]),
  subject: z.string().trim().min(3).max(SUPPORT_TICKET_SUBJECT_MAX_LENGTH),
  text: z.string().trim().min(3).max(SUPPORT_TICKET_MESSAGE_MAX_LENGTH),
});

export type SupportTicketDto = z.infer<typeof supportTicketDtoSchema>;

// Адрес как опциональная структура внутри company-profile patch'а.
// formatted — единственное обязательное поле; остальное заполняется по мере
// готовности данных (автокомплит Яндекс/dadata подтянет всё сразу).
// Если все поля null, кроме formatted='Не указан' — это «затрущенный» legacy-адрес.
export const addressDtoSchema = z.object({
  country: z.string().trim().max(64).default("Россия"),
  region: z.string().trim().max(120).nullish(),
  city: z.string().trim().min(1).max(120),
  street: z.string().trim().max(200).nullish(),
  building: z.string().trim().max(40).nullish(),
  apartment: z.string().trim().max(40).nullish(),
  postcode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Индекс — 6 цифр")
    .nullish(),
  // formatted — авторитетный текст для отображения. Если не передан, бэк
  // соберёт его сам из остальных полей.
  formatted: z.string().trim().min(1).max(500).nullish(),
});

export type AddressDto = z.infer<typeof addressDtoSchema>;

// PATCH /api/billing/company — частичное обновление профиля компании.
// Все поля опциональны, не передал — не меняется. null означает «очистить».
export const companyProfileUpdateDtoSchema = z.object({
  organizationName: z.string().trim().min(2).max(255).optional(),
  websiteUrl: z.string().trim().url("Введите корректный URL, например https://example.com").or(z.literal("")).nullish(),
  corporatePhone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d\s()-]{6,30}$/, "Телефон в формате +7XXXXXXXXXX")
    .or(z.literal(""))
    .nullish(),
  corporateEmail: z.string().trim().email().or(z.literal("")).nullish(),
  about: z.string().trim().max(2000).nullish(),
  contactPersonName: z.string().trim().max(200).nullish(),
  contactPersonPhone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d\s()-]{6,30}$/, "Телефон в формате +7XXXXXXXXXX")
    .or(z.literal(""))
    .nullish(),
  contactPersonEmail: z.string().trim().email().or(z.literal("")).nullish(),
  billingInn: z
    .string()
    .trim()
    .regex(/^(\d{10}|\d{12})$/, "ИНН — 10 или 12 цифр")
    .or(z.literal(""))
    .nullish(),
  billingKpp: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "КПП — 9 цифр")
    .or(z.literal(""))
    .nullish(),
  bankName: z.string().trim().max(255).nullish(),
  bankBik: z
    .string()
    .trim()
    .regex(/^\d{9}$/, "БИК — 9 цифр")
    .or(z.literal(""))
    .nullish(),
  bankAccount: z
    .string()
    .trim()
    .regex(/^\d{20}$/, "Счёт — 20 цифр")
    .or(z.literal(""))
    .nullish(),
  correspondentAccount: z
    .string()
    .trim()
    .regex(/^\d{20}$/, "Кор. счёт — 20 цифр")
    .or(z.literal(""))
    .nullish(),
  // Адреса: передать объект — заменить целиком; null — очистить.
  factualAddress: addressDtoSchema.nullish(),
  structuredLegalAddress: addressDtoSchema.nullish(),
});

export type CompanyProfileUpdateDto = z.infer<typeof companyProfileUpdateDtoSchema>;

// ── Торговая площадка: объявления ──────────────────────────────────────────
// Бизнес-ограничения объявления (docs/04-marketplace/listings.md). Держим в
// shared, чтобы и бэк-валидация, и UI («10/10 активных», «мин. 100 кг») брали
// одни и те же числа.
export const LISTING_MIN_WEIGHT_KG = 100;
export const LISTING_MAX_ACTIVE = 10;
export const LISTING_LIFETIME_DAYS = 14;
export const LISTING_MIN_PHOTOS = 4;
export const LISTING_MAX_PHOTOS = 10;
export const LISTING_MAX_VIDEOS = 2;
export const LISTING_MAX_POSITIONS = 50;

export const listingPositionInputSchema = z.object({
  nomenclatureId: z.string().min(1),
  // Вес позиции в кг. Минимум 100 кг — агрегатно по объявлению (проверяется в сервисе).
  weightKg: z.number().positive().max(100_000_000),
  form: z.enum(listingPositionForms).default("loose"),
  moistureCondition: z.enum(listingMoistureConditions).nullish(),
  contaminationCondition: z.enum(listingContaminationConditions).nullish(),
  packaging: z.string().trim().max(200).nullish(),
});

export type ListingPositionInput = z.infer<typeof listingPositionInputSchema>;

export const listingMediaInputSchema = z.object({
  fileId: z.string().min(1),
  kind: z.enum(["photo", "video"]),
});

export type ListingMediaInput = z.infer<typeof listingMediaInputSchema>;

export const createListingDtoSchema = z.object({
  positions: z
    .array(listingPositionInputSchema)
    .min(1, "Добавьте хотя бы одну позицию")
    .max(LISTING_MAX_POSITIONS, { error: `Не больше ${LISTING_MAX_POSITIONS} позиций в объявлении.` }),
  address: addressDtoSchema,
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d\s()-]{6,30}$/, "Телефон в формате +7XXXXXXXXXX"),
  description: z.string().trim().max(2000).nullish(),
  paymentTerms: z.string().trim().max(500).nullish(),
  // Типичный объём отгрузки в одну машину, в кг (фронт вводит тонны → ×1000).
  typicalLoadKg: z.number().positive().max(100000).nullish(),
  // Готовность: «готово сейчас» или конкретная дата (валидируется в сервисе ≤14 дней).
  readyNow: z.boolean().default(true),
  readinessDate: z.string().datetime().nullish(),
  media: z
    .array(listingMediaInputSchema)
    .max(LISTING_MAX_PHOTOS + LISTING_MAX_VIDEOS)
    .default([]),
});

export type CreateListingDto = z.infer<typeof createListingDtoSchema>;

export const updateListingDtoSchema = createListingDtoSchema.partial();

export type UpdateListingDto = z.infer<typeof updateListingDtoSchema>;

// ── Торговая площадка: предложения (фаза 3) ───────────────────────────────
export const offerPositionInputSchema = z.object({
  listingPositionId: z.string().min(1),
  // Цена за тонну, ₽. null/опущено = «не интересует» эту позицию.
  pricePerTonRub: z.number().int().positive().max(100_000_000).nullish(),
});

export type OfferPositionInput = z.infer<typeof offerPositionInputSchema>;

export const createOfferDtoSchema = z.object({
  priceCondition: z.enum(priceConditions),
  // Город покупателя — обязателен для «цена на воротах» (проверяется в сервисе).
  city: z.string().trim().max(120).nullish(),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?\d[\d\s()-]{6,30}$/, "Телефон в формате +7XXXXXXXXXX"),
  positions: z
    .array(offerPositionInputSchema)
    .min(1, "Добавьте хотя бы одну позицию")
    .max(LISTING_MAX_POSITIONS, { error: `Не больше ${LISTING_MAX_POSITIONS} позиций в предложении.` }),
});

export type CreateOfferDto = z.infer<typeof createOfferDtoSchema>;

export const updateOfferDtoSchema = createOfferDtoSchema.partial();

export type UpdateOfferDto = z.infer<typeof updateOfferDtoSchema>;

export const dealDecisionDtoSchema = z.object({ result: z.enum(dealResults) });

export type DealDecisionDto = z.infer<typeof dealDecisionDtoSchema>;

// ── Торговая площадка: отзывы (фаза 4) ────────────────────────────────────
// Направление вычисляет сервер (кто кого оценивает) — клиент шлёт только баллы
// и комментарий. Состав критериев сервер проверяет по направлению.
export const reviewScoreInputSchema = z.object({
  criterion: z.enum(reviewCriteria),
  score: z.number().int().min(1).max(5),
});

export const createReviewDtoSchema = z.object({
  scores: z.array(reviewScoreInputSchema).min(1, "Оцените хотя бы по одному критерию"),
  comment: z.string().trim().max(2000).nullish(),
});

export type CreateReviewDto = z.infer<typeof createReviewDtoSchema>;

export const reviewResponseDtoSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export type ReviewResponseDto = z.infer<typeof reviewResponseDtoSchema>;
