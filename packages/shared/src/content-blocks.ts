import { z } from "zod";

export const contentBlockKinds = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "gallery",
  "video",
  "audio",
  "file",
  "checklist",
  "image_checklist",
  "lesson_tasks",
  "quiz",
  "matching",
] as const;

export type ContentBlockKind = (typeof contentBlockKinds)[number];

// Версионирование payload-блоков (Волна 7.7). Все блоки в БД получают
// ключ `v` внутри payload (jsonb). Сейчас единственная версия — 1.
//
// Идея: когда формат блока меняется (например, paragraph_v2 с расширенным
// inline-форматированием), старые строки остаются как `v: 1` и читаются
// старым парсером, новые — `v: 2` и читаются новым. Никакой массовой
// миграции данных при изменении формата не нужно.
//
// Конкретные TS-типы блоков (BaseContentBlock, LessonContentBlock) — это
// «текущая» (= v1) форма. ContentBlockV1 — обобщённая обёртка для слоёв,
// которые работают с блоком «снаружи payload» (например, рендер-роутер).
export const CURRENT_CONTENT_BLOCK_VERSION = 1 as const;

export type ContentBlockV1<TPayload = Record<string, unknown>> = {
  type: ContentBlockKind;
  payload: TPayload & { v: 1 };
};

const imagePayloadSchema = z.object({
  fileId: z.string().min(1),
  caption: z.string().optional(),
  altText: z.string().optional(),
});

export const baseContentBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("heading"),
    payload: z.object({ text: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("subheading"),
    payload: z.object({ text: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("paragraph"),
    payload: z.object({ html: z.string().min(1) }),
  }),
  z.object({
    type: z.literal("image"),
    payload: imagePayloadSchema,
  }),
  z.object({
    type: z.literal("gallery"),
    payload: z.object({ images: z.array(imagePayloadSchema).min(1) }),
  }),
  z.object({
    type: z.literal("video"),
    // Видео-блок: только собственный загруженный файл — без сторонних плееров
    // и рекламы. Поддержка Rutube убрана осознанно (решение владельца 2026-06).
    payload: z.object({
      fileId: z.string().min(1),
      caption: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("audio"),
    payload: z.object({
      fileId: z.string().min(1),
      episodeTitle: z.string().optional(),
      caption: z.string().optional(),
      durationSeconds: z.number().int().positive().optional(),
    }),
  }),
  z.object({
    type: z.literal("file"),
    payload: z.object({
      fileId: z.string().min(1),
      displayName: z.string().min(1),
      description: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal("checklist"),
    payload: z.object({
      title: z.string().min(1),
      style: z.enum(["positive", "negative", "warning", "info"]),
      items: z.array(z.string().min(1)).min(1),
    }),
  }),
  z.object({
    type: z.literal("image_checklist"),
    payload: z.object({
      title: z.string().min(1),
      style: z.enum(["positive", "negative", "warning", "info"]),
      image: imagePayloadSchema,
      items: z.array(z.string().min(1)).min(1),
    }),
  }),
]);

export type BaseContentBlock = z.infer<typeof baseContentBlockSchema>;

export const lessonTasksBlockSchema = z.object({
  type: z.literal("lesson_tasks"),
  payload: z.object({
    tasks: z
      .array(
        z.object({
          title: z.string().min(1),
          description: z.string().optional(),
        }),
      )
      .min(1),
  }),
});

// --- Интерактивные блоки (только уроки) ---------------------------------

export const quizBlockSchema = z.object({
  type: z.literal("quiz"),
  // Тест с выбором ответа. multiple=false — ровно один правильный вариант
  // (radio), multiple=true — допускается несколько (checkbox). Поле correct
  // помечает правильные варианты. Сама проверка ответа ученика — на стороне
  // урока (рендер/рантайм), здесь только хранится «правильность».
  payload: z
    .object({
      question: z.string().min(1),
      multiple: z.boolean().default(false),
      options: z
        .array(
          z.object({
            text: z.string().min(1),
            correct: z.boolean().default(false),
          }),
        )
        .min(2),
      explanation: z.string().optional(),
    })
    .refine((value) => value.options.some((option) => option.correct), {
      message: "Отметьте хотя бы один правильный вариант ответа.",
    }),
});

export const matchingBlockSchema = z.object({
  type: z.literal("matching"),
  // Сопоставление: ученик соединяет элементы левого столбца с правильными
  // парами из правого (перетаскиванием). Храним список верных пар.
  payload: z.object({
    instruction: z.string().optional(),
    pairs: z
      .array(
        z.object({
          left: z.string().min(1),
          right: z.string().min(1),
        }),
      )
      .min(2),
    explanation: z.string().optional(),
  }),
});

export const lessonContentBlockSchema = z.union([
  baseContentBlockSchema,
  lessonTasksBlockSchema,
  quizBlockSchema,
  matchingBlockSchema,
]);

export type LessonContentBlock = z.infer<typeof lessonContentBlockSchema>;

export const newsBlockSchema = baseContentBlockSchema.refine(
  (block) => ["heading", "subheading", "paragraph", "image", "gallery", "video", "audio"].includes(block.type),
  "Новости поддерживают только стандартные медиа- и текстовые блоки.",
);

const lessonAllowedKinds: readonly string[] = [
  "heading",
  "subheading",
  "paragraph",
  "image",
  "gallery",
  "video",
  "lesson_tasks",
  "quiz",
  "matching",
];

export const lessonBlockSchema = lessonContentBlockSchema.refine(
  (block) => lessonAllowedKinds.includes(block.type),
  "Уроки поддерживают только учебные текстовые, медиа-, task- и интерактивные блоки.",
);

export const knowledgeBaseSectionTitles = [
  "ГОСТы",
  "Ликвидность",
  "Засор и влажность",
  "Сортировка",
  "Прессование",
  "Сезонность",
  "Как отличать",
  "Нюансы и лайфхаки",
  "Дополнительные файлы",
] as const;

export type KnowledgeBaseSectionTitle = (typeof knowledgeBaseSectionTitles)[number];

type BlockParseResult = { success: true } | { success: false; error: { issues: Array<{ message: string }> } };

type BlockSchema = { safeParse: (value: unknown) => BlockParseResult };

export function validateContentBlocks(
  blocks: unknown[],
  schema: BlockSchema = baseContentBlockSchema,
): { ok: true } | { ok: false; message: string } {
  if (blocks.length === 0) {
    return { ok: false, message: "Нужен хотя бы один блок контента." };
  }

  for (const block of blocks) {
    const parsed = schema.safeParse(block);

    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? "Блок контента заполнен неверно." };
    }
  }

  return { ok: true };
}

export function validateNewsBlocks(blocks: unknown[]): { ok: true } | { ok: false; message: string } {
  return validateContentBlocks(blocks, newsBlockSchema);
}

export function validateLessonBlocks(blocks: unknown[]): { ok: true } | { ok: false; message: string } {
  return validateContentBlocks(blocks, lessonBlockSchema);
}
