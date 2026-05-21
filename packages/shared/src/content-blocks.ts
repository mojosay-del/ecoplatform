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
] as const;

export type ContentBlockKind = (typeof contentBlockKinds)[number];

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
    payload: z.object({ markdown: z.string().min(1) }),
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
    // Видео-блок: либо собственный файл (fileId, приоритет — без сторонней
    // рекламы), либо ссылка на Rutube (rutubeUrl, для старых публикаций).
    // Хотя бы одно поле должно быть заполнено.
    payload: z
      .object({
        fileId: z.string().min(1).optional(),
        rutubeUrl: z.string().url().optional(),
        caption: z.string().optional(),
      })
      .refine((value) => Boolean(value.fileId) || Boolean(value.rutubeUrl), {
        message: "Загрузите видеофайл или укажите ссылку на Rutube.",
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

export const newsBlockSchema = baseContentBlockSchema.refine(
  (block) => ["heading", "subheading", "paragraph", "image", "gallery", "video", "audio"].includes(block.type),
  "Новости поддерживают только стандартные медиа- и текстовые блоки.",
);

export const lessonBlockSchema = baseContentBlockSchema.refine(
  (block) => ["heading", "subheading", "paragraph", "image", "gallery", "video"].includes(block.type),
  "Уроки MVP не поддерживают audio, file и специальные блоки базы знаний.",
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

type BlockParseResult =
  | { success: true }
  | { success: false; error: { issues: Array<{ message: string }> } };

type BlockSchema = { safeParse: (value: unknown) => BlockParseResult };

export function validateContentBlocks(
  blocks: BaseContentBlock[],
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

export function validateNewsBlocks(blocks: BaseContentBlock[]): { ok: true } | { ok: false; message: string } {
  return validateContentBlocks(blocks, newsBlockSchema);
}

export function validateLessonBlocks(blocks: BaseContentBlock[]): { ok: true } | { ok: false; message: string } {
  return validateContentBlocks(blocks, lessonBlockSchema);
}
