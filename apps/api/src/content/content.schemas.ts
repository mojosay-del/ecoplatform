import { z } from "zod";
import {
  baseContentBlockSchema,
  knowledgeBaseDisplayIconNames,
  lessonBlockSchema,
  newsBlockSchema,
} from "@ecoplatform/shared";

function paginationQuerySchema(maxLimit: number) {
  return z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    page: z.coerce.number().int().min(1).optional(),
    take: z.coerce.number().int().min(1).max(maxLimit).optional(),
  });
}

const stringArrayQueryValueSchema = z.union([z.string(), z.array(z.string())]);
const lessonCoverSubtitleSchema = z.string().trim().max(120).nullable().optional();

export const newsListQuerySchema = paginationQuerySchema(100).extend({
  tags: stringArrayQueryValueSchema.optional(),
  "tags[]": stringArrayQueryValueSchema.optional(),
});

export const newsTagsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const publicContentListQuerySchema = paginationQuerySchema(100);
export const adminNewsListQuerySchema = paginationQuerySchema(100).extend({
  q: z.string().trim().max(120).optional(),
});
export const adminContentListQuerySchema = paginationQuerySchema(200);

export const knowledgeTreeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  depth: z.coerce.number().int().min(1).max(3).optional(),
});

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
  position: z.number().int().nonnegative().optional(),
});

export const nomenclatureUpdateInputSchema = z.object({
  categoryId: z.string().min(1).optional(),
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  position: z.number().int().nonnegative().optional(),
  isActive: z.boolean().optional(),
});

export const nomenclatureMoveInputSchema = z.object({
  categoryId: z.string().min(1),
  position: z.number().int().nonnegative(),
});

export const priceIndexInputSchema = z.object({
  nomenclatureId: z.string().min(1),
  description: z.string().optional(),
});

export const priceIndexValueInputSchema = z.object({
  date: z.string().datetime(),
  price: z.number().int().positive(),
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
          coverImageId: z.string().nullable().optional(),
          coverSubtitle: lessonCoverSubtitleSchema,
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
  displayIcon: z.enum(knowledgeBaseDisplayIconNames).nullable().optional(),
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

export const documentationTreeQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  depth: z.coerce.number().int().min(1).max(3).optional(),
});

export const documentationRecentQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const documentationArticleInputSchema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().min(1),
  subtitle: z.string().nullable().optional(),
  slug: z.string().optional(),
  position: z.number().int().nonnegative(),
  iconType: z.string().optional(),
  blocks: z.array(baseContentBlockSchema).default([]),
  // Документ-первые поля (для листьев; у разделов остаются пустыми).
  fileAssetId: z.string().nullable().optional(),
  version: z.string().trim().max(60).nullable().optional(),
  effectiveDate: z.string().datetime().nullable().optional(),
  isPinned: z.boolean().optional(),
  // Явная отметка «это обновление документа» → ставит revisedAt=now() при сохранении.
  markRevised: z.boolean().optional(),
});

export const documentationMoveInputSchema = z.object({
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
  coverImageId: z.string().nullable().optional(),
  coverSubtitle: lessonCoverSubtitleSchema,
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
  coverImageId: z.string().nullable().optional(),
  coverSubtitle: lessonCoverSubtitleSchema,
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
