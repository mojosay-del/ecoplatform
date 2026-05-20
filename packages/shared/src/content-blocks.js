"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.knowledgeBaseSectionTitles = exports.lessonBlockSchema = exports.newsBlockSchema = exports.baseContentBlockSchema = exports.contentBlockKinds = void 0;
exports.validateContentBlocks = validateContentBlocks;
const zod_1 = require("zod");
exports.contentBlockKinds = [
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
];
const imagePayloadSchema = zod_1.z.object({
    fileId: zod_1.z.string().min(1),
    caption: zod_1.z.string().optional(),
    altText: zod_1.z.string().optional(),
});
exports.baseContentBlockSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({
        type: zod_1.z.literal("heading"),
        payload: zod_1.z.object({ text: zod_1.z.string().min(1) }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("subheading"),
        payload: zod_1.z.object({ text: zod_1.z.string().min(1) }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("paragraph"),
        payload: zod_1.z.object({ markdown: zod_1.z.string().min(1) }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("image"),
        payload: imagePayloadSchema,
    }),
    zod_1.z.object({
        type: zod_1.z.literal("gallery"),
        payload: zod_1.z.object({ images: zod_1.z.array(imagePayloadSchema).min(1) }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("video"),
        payload: zod_1.z.object({
            rutubeUrl: zod_1.z.string().url(),
            caption: zod_1.z.string().optional(),
        }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("audio"),
        payload: zod_1.z.object({
            fileId: zod_1.z.string().min(1),
            episodeTitle: zod_1.z.string().optional(),
            caption: zod_1.z.string().optional(),
            durationSeconds: zod_1.z.number().int().positive().optional(),
        }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("file"),
        payload: zod_1.z.object({
            fileId: zod_1.z.string().min(1),
            displayName: zod_1.z.string().min(1),
            description: zod_1.z.string().optional(),
        }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("checklist"),
        payload: zod_1.z.object({
            title: zod_1.z.string().min(1),
            style: zod_1.z.enum(["positive", "negative", "warning", "info"]),
            items: zod_1.z.array(zod_1.z.string().min(1)).min(1),
        }),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("image_checklist"),
        payload: zod_1.z.object({
            title: zod_1.z.string().min(1),
            style: zod_1.z.enum(["positive", "negative", "warning", "info"]),
            image: imagePayloadSchema,
            items: zod_1.z.array(zod_1.z.string().min(1)).min(1),
        }),
    }),
]);
exports.newsBlockSchema = exports.baseContentBlockSchema.refine((block) => ["heading", "subheading", "paragraph", "image", "gallery", "video", "audio"].includes(block.type), "Новости поддерживают только стандартные медиа- и текстовые блоки.");
exports.lessonBlockSchema = exports.baseContentBlockSchema.refine((block) => ["heading", "subheading", "paragraph", "image", "gallery", "video"].includes(block.type), "Уроки MVP не поддерживают audio, file и специальные блоки базы знаний.");
exports.knowledgeBaseSectionTitles = [
    "ГОСТы",
    "Ликвидность",
    "Засор и влажность",
    "Сортировка",
    "Прессование",
    "Сезонность",
    "Как отличать",
    "Нюансы и лайфхаки",
    "Дополнительные файлы",
];
function validateContentBlocks(blocks) {
    if (blocks.length === 0) {
        return { ok: false, message: "Нужен хотя бы один блок контента." };
    }
    for (const block of blocks) {
        const parsed = exports.baseContentBlockSchema.safeParse(block);
        if (!parsed.success) {
            return { ok: false, message: parsed.error.issues[0]?.message ?? "Блок контента заполнен неверно." };
        }
    }
    return { ok: true };
}
