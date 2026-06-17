import { z } from "zod";

// Zod-схемы входа раздела «Форум». Валидация на границе HTTP (parseBody),
// права — в сервисе/воркфлоу. Тело вопроса/ответа — простой текст (не блоки).

export const forumListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  rawMaterialId: z.string().trim().min(1).optional(),
  questionTypeId: z.string().trim().min(1).optional(),
  sort: z.enum(["newest", "unanswered", "popular"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Новый вопрос: заголовок + оба тега обязательны (ТЗ §7.3), подробности — нет.
export const forumQuestionInputSchema = z.object({
  title: z.string().trim().min(1, "Добавьте заголовок вопроса").max(180),
  body: z.string().trim().max(8000).default(""),
  rawMaterialId: z.string().trim().min(1, "Выберите вид сырья"),
  questionTypeId: z.string().trim().min(1, "Выберите тип вопроса"),
});

// Правка своего вопроса — все поля опциональны, но теги, если переданы, не пустые.
export const forumQuestionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  body: z.string().trim().max(8000).optional(),
  rawMaterialId: z.string().trim().min(1).optional(),
  questionTypeId: z.string().trim().min(1).optional(),
});

export const forumAnswerInputSchema = z.object({
  body: z.string().trim().min(1, "Напишите ответ").max(8000),
});

export const forumAcceptInputSchema = z.object({
  answerId: z.string().trim().min(1),
});

// ── Админка ─────────────────────────────────────────────────────────────────
export const forumAdminListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(["open", "answered", "solved", "hidden"]).optional(),
  rawMaterialId: z.string().trim().min(1).optional(),
  questionTypeId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// Значение оси-справочника (Вид сырья / Тип вопроса).
export const forumTaxonomyInputSchema = z.object({
  label: z.string().trim().min(1, "Введите название").max(80),
  position: z.number().int().nonnegative().optional(),
});

export const forumTaxonomyUpdateSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  position: z.number().int().nonnegative().optional(),
});
