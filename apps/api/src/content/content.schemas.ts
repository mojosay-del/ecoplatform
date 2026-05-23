import { z } from "zod";
import { baseContentBlockSchema, lessonBlockSchema, newsBlockSchema } from "@ecoplatform/shared";

export const newsInputSchema = z.object({
  title: z.string().min(1),
  lead: z.string().min(1),
  coverImageId: z.string().nullable().optional(),
  slug: z.string().optional(),
  blocks: z.array(newsBlockSchema).default([]),
  tags: z.array(z.string().min(1)).default([]),
});

export const categoryInputSchema = z.object({
  name: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export const categoryUpdateInputSchema = z.object({
  name: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const nomenclatureInputSchema = z.object({
  categoryId: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  unit: z.string().min(1).default("₽/т"),
  description: z.string().optional(),
});

export const nomenclatureUpdateInputSchema = z.object({
  categoryId: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const priceIndexInputSchema = z.object({
  nomenclatureId: z.string().min(1),
  description: z.string().optional(),
});

export const priceIndexValueInputSchema = z.object({
  date: z.string().datetime(),
  price: z.number().positive(),
});

export const learningModuleInputSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  coverImageId: z.string().optional(),
  accessLevel: z.enum(["basic", "extended", "one_time"]).default("basic"),
  oneTimePrice: z.number().int().positive().optional(),
  isInDevelopment: z.boolean().default(false),
  preview: z.object({
    promotionalDescription: z.string().min(1),
    whatYouWillLearn: z.array(z.string()).default([]),
  }),
  chapters: z.array(
    z.object({
      title: z.string().min(1),
      lessons: z.array(
        z.object({
          title: z.string().min(1),
          blocks: z.array(lessonBlockSchema).default([]),
          attachments: z
            .array(
              z.object({
                fileId: z.string().min(1),
                displayName: z.string().min(1),
              }),
            )
            .default([]),
        }),
      ),
    }),
  ),
});

export const knowledgeArticleInputSchema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  subtitle: z.string().optional(),
  coverImageId: z.string().nullable().optional(),
  slug: z.string().optional(),
  position: z.number().int().nonnegative(),
  iconType: z.string().optional(),
  blocks: z.array(baseContentBlockSchema).default([]),
});

export const commentInputSchema = z.object({
  text: z.string().min(1),
  parentCommentId: z.string().optional(),
});

export const knowledgeMoveInputSchema = z.object({
  parentId: z.string().nullable(),
  position: z.number().int().nonnegative(),
});

export const learningModuleUpdateInputSchema = z.object({
  title: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  coverImageId: z.string().nullable().optional(),
  accessLevel: z.enum(["basic", "extended", "one_time"]).optional(),
  oneTimePrice: z.number().int().positive().nullable().optional(),
  isInDevelopment: z.boolean().optional(),
  position: z.number().int().nonnegative().optional(),
  preview: z
    .object({
      promotionalDescription: z.string().min(1),
      whatYouWillLearn: z.array(z.string()).default([]),
    })
    .optional(),
});

export const chapterInputSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export const chapterUpdateInputSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
});

export const lessonInputSchema = z.object({
  title: z.string().min(1),
  position: z.number().int().nonnegative(),
  blocks: z.array(lessonBlockSchema).default([]),
  attachments: z
    .array(
      z.object({
        fileId: z.string().min(1),
        displayName: z.string().min(1),
      }),
    )
    .default([]),
});

export const lessonUpdateInputSchema = z.object({
  title: z.string().min(1).optional(),
  position: z.number().int().nonnegative().optional(),
  blocks: z.array(lessonBlockSchema).optional(),
  attachments: z
    .array(
      z.object({
        fileId: z.string().min(1),
        displayName: z.string().min(1),
      }),
    )
    .optional(),
});
