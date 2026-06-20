import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus, ForumQuestionStatus } from "@prisma/client";
import type { SeoPageSummary, SeoPageType, SeoSitemapEntry, SeoSitemapResponse } from "@ecoplatform/shared";
import { publicUrl } from "../files/files-storage.helpers";
import { PrismaService } from "../prisma/prisma.service";
import { forumExcerpt } from "../forum/forum-response.helpers";

type ParentStatusNode = {
  status: ContentStatus;
  parent?: ParentStatusNode | null;
} | null;

// Протокол sitemap ограничивает один файл 50 000 URL. Держим явный кап на тип,
// чтобы запрос/ответ оставались ограниченными при росте контента (суммарно ≤ 40k).
// Если когда-нибудь упрёмся в лимит — переходим на sitemap-index с постранично.
const SITEMAP_MAX_PER_TYPE = 10_000;

const DEFAULT_DESCRIPTIONS: Record<SeoPageType, string> = {
  news: "Новость рынка вторсырья на ЭкоПлатформе.",
  knowledge_base: "Материал базы знаний ЭкоПлатформы для рынка вторсырья.",
  documentation: "Документ ЭкоПлатформы для работы с вторсырьём.",
  forum_question: "Вопрос и ответы сообщества ЭкоПлатформы.",
};

@Injectable()
export class SeoService {
  constructor(private readonly prisma: PrismaService) {}

  async sitemap(): Promise<SeoSitemapResponse> {
    const [news, knowledge, documentation, forumQuestions] = await Promise.all([
      this.prisma.newsPost.findMany({
        where: { status: ContentStatus.published },
        orderBy: { firstPublishedAt: "desc" },
        take: SITEMAP_MAX_PER_TYPE,
        select: { slug: true, firstPublishedAt: true, updatedAt: true },
      }),
      this.prisma.knowledgeBaseArticle.findMany({
        where: { status: ContentStatus.published },
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        take: SITEMAP_MAX_PER_TYPE,
        select: {
          slug: true,
          firstPublishedAt: true,
          updatedAt: true,
          parent: { select: { status: true, parent: { select: { status: true } } } },
        },
      }),
      this.prisma.documentationArticle.findMany({
        where: { status: ContentStatus.published },
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        take: SITEMAP_MAX_PER_TYPE,
        select: {
          slug: true,
          firstPublishedAt: true,
          revisedAt: true,
          updatedAt: true,
          parent: { select: { status: true, parent: { select: { status: true } } } },
        },
      }),
      this.prisma.forumQuestion.findMany({
        where: { status: { not: ForumQuestionStatus.hidden } },
        orderBy: { createdAt: "desc" },
        take: SITEMAP_MAX_PER_TYPE,
        select: { id: true, createdAt: true, updatedAt: true },
      }),
    ]);

    const items: SeoSitemapEntry[] = [
      ...news.map((item) => sitemapEntry("news", `/news/${item.slug}`, item.firstPublishedAt, item.updatedAt)),
      ...knowledge
        .filter((item) => isPublishedParentChain(item.parent))
        .map((item) =>
          sitemapEntry("knowledge_base", `/knowledge-base/${item.slug}`, item.firstPublishedAt, item.updatedAt),
        ),
      ...documentation
        .filter((item) => isPublishedParentChain(item.parent))
        .map((item) =>
          sitemapEntry(
            "documentation",
            `/documentation/${item.slug}`,
            item.firstPublishedAt,
            item.revisedAt ?? item.updatedAt,
          ),
        ),
      ...forumQuestions.map((item) =>
        sitemapEntry("forum_question", `/forum/q/${item.id}`, item.createdAt, item.updatedAt),
      ),
    ];

    return { items };
  }

  async page(rawPath: string): Promise<SeoPageSummary> {
    const path = normalizeSeoPath(rawPath);

    const newsSlug = matchPath(path, /^\/news\/([^/]+)$/);
    if (newsSlug) {
      return this.newsPage(newsSlug);
    }

    const knowledgeSlug = matchPath(path, /^\/knowledge-base\/([^/]+)$/);
    if (knowledgeSlug) {
      return this.knowledgePage(knowledgeSlug);
    }

    const documentationSlug = matchPath(path, /^\/documentation\/([^/]+)$/);
    if (documentationSlug) {
      return this.documentationPage(documentationSlug);
    }

    const forumQuestionId = matchPath(path, /^\/forum\/q\/([^/]+)$/);
    if (forumQuestionId) {
      return this.forumQuestionPage(forumQuestionId);
    }

    throw new NotFoundException("SEO-страница не найдена.");
  }

  private async newsPage(slug: string): Promise<SeoPageSummary> {
    const row = await this.prisma.newsPost.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        lead: true,
        coverImageId: true,
        status: true,
        firstPublishedAt: true,
        updatedAt: true,
      },
    });
    if (!row || row.status !== ContentStatus.published) {
      throw new NotFoundException("SEO-страница не найдена.");
    }

    return {
      type: "news",
      path: `/news/${row.slug}`,
      title: row.title,
      description: safeDescription(row.lead, "news"),
      imageUrl: await this.publicImageUrl(row.coverImageId),
      publishedAt: toIso(row.firstPublishedAt),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async knowledgePage(slug: string): Promise<SeoPageSummary> {
    const row = await this.prisma.knowledgeBaseArticle.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        coverImageId: true,
        status: true,
        firstPublishedAt: true,
        updatedAt: true,
        parent: { select: { status: true, parent: { select: { status: true } } } },
      },
    });
    if (!row || row.status !== ContentStatus.published || !isPublishedParentChain(row.parent)) {
      throw new NotFoundException("SEO-страница не найдена.");
    }

    return {
      type: "knowledge_base",
      path: `/knowledge-base/${row.slug}`,
      title: row.title,
      description: safeDescription(row.subtitle, "knowledge_base"),
      imageUrl: await this.publicImageUrl(row.coverImageId),
      publishedAt: toIso(row.firstPublishedAt),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async documentationPage(slug: string): Promise<SeoPageSummary> {
    const row = await this.prisma.documentationArticle.findUnique({
      where: { slug },
      select: {
        slug: true,
        title: true,
        subtitle: true,
        status: true,
        firstPublishedAt: true,
        revisedAt: true,
        updatedAt: true,
        parent: { select: { status: true, parent: { select: { status: true } } } },
      },
    });
    if (!row || row.status !== ContentStatus.published || !isPublishedParentChain(row.parent)) {
      throw new NotFoundException("SEO-страница не найдена.");
    }

    return {
      type: "documentation",
      path: `/documentation/${row.slug}`,
      title: row.title,
      description: safeDescription(row.subtitle, "documentation"),
      imageUrl: null,
      publishedAt: toIso(row.firstPublishedAt),
      updatedAt: (row.revisedAt ?? row.updatedAt).toISOString(),
    };
  }

  private async forumQuestionPage(id: string): Promise<SeoPageSummary> {
    const row = await this.prisma.forumQuestion.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        body: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!row || row.status === ForumQuestionStatus.hidden) {
      throw new NotFoundException("SEO-страница не найдена.");
    }

    return {
      type: "forum_question",
      path: `/forum/q/${row.id}`,
      title: row.title,
      description: safeDescription(forumExcerpt(row.body), "forum_question"),
      imageUrl: null,
      publishedAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async publicImageUrl(fileId: string | null): Promise<string | null> {
    if (!fileId) {
      return null;
    }
    const file = await this.prisma.fileAsset.findUnique({
      where: { id: fileId },
      select: { storageKey: true, accessLevel: true },
    });
    return file ? publicUrl(file.storageKey, file.accessLevel) : null;
  }
}

function sitemapEntry(type: SeoPageType, path: string, publishedAt: Date | null, updatedAt: Date): SeoSitemapEntry {
  return {
    type,
    path,
    publishedAt: toIso(publishedAt),
    updatedAt: updatedAt.toISOString(),
  };
}

function isPublishedParentChain(parent: ParentStatusNode): boolean {
  if (!parent) {
    return true;
  }
  return parent.status === ContentStatus.published && isPublishedParentChain(parent.parent ?? null);
}

function normalizeSeoPath(rawPath: string): string {
  try {
    const url = new URL(rawPath, "https://ecoplatform.pro");
    return url.pathname.replace(/\/+$/, "") || "/";
  } catch {
    throw new NotFoundException("SEO-страница не найдена.");
  }
}

function matchPath(path: string, pattern: RegExp): string | null {
  const match = pattern.exec(path);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function safeDescription(value: string | null | undefined, type: SeoPageType): string {
  const clean = value?.replace(/\s+/g, " ").trim();
  if (!clean) {
    return DEFAULT_DESCRIPTIONS[type];
  }
  return clean.length > 180 ? `${clean.slice(0, 179).trimEnd()}…` : clean;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}
