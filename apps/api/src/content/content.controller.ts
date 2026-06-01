import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { Section } from "../navigation/section.decorator";
import { SectionVisibilityGuard } from "../navigation/section-visibility.guard";
import {
  categoryInputSchema,
  categoryUpdateInputSchema,
  adminContentListQuerySchema,
  adminNewsListQuerySchema,
  chapterInputSchema,
  chapterUpdateInputSchema,
  commentInputSchema,
  knowledgeTreeQuerySchema,
  knowledgeArticleInputSchema,
  knowledgeMoveInputSchema,
  learningModuleInputSchema,
  learningModuleUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
  newsListQuerySchema,
  newsInputSchema,
  newsTagsQuerySchema,
  nomenclatureInputSchema,
  nomenclatureUpdateInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
  publicContentListQuerySchema,
} from "./content.schemas";
import { IndicesService } from "./services/indices.service";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { LearningService } from "./services/learning.service";
import { NewsService } from "./services/news.service";

function parseStringArrayQuery(...values: Array<string | string[] | undefined>): string[] {
  return values.flatMap((value) => (Array.isArray(value) ? value : value !== undefined ? [value] : []));
}

function isPreviewQuery(value?: string) {
  return value === "1" || value === "true";
}

// Контроллер контент-домена. Инжектит 4 доменных сервиса (по результатам
// Волны 3.2 split). Маршруты сгруппированы по доменам — секции News /
// Indices / Learning / KnowledgeBase. Внутри каждой — сперва публичные,
// потом /admin/*. Порядок маршрутов важен: специфичные пути (например,
// `admin/content/news/tags`) идут ПЕРЕД `admin/content/news/:id`, иначе
// NestJS попытается интерпретировать "tags" как `:id`.
@UseGuards(JwtAuthGuard, SectionVisibilityGuard)
@Controller()
export class ContentController {
  constructor(
    private readonly news: NewsService,
    private readonly indices: IndicesService,
    private readonly learning: LearningService,
    private readonly knowledgeBase: KnowledgeBaseService,
  ) {}

  // ── Публичные: новости ──────────────────────────────────────────────────

  @Section("news")
  @Get("news")
  async listNews(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    const input = parseBody(newsListQuerySchema, query);
    return this.news.listNews(user, {
      limit: input.limit,
      offset: input.offset,
      page: input.page,
      take: input.take,
      tags: parseStringArrayQuery(input.tags, input["tags[]"]),
    });
  }

  @Section("news")
  @Get("news/tags")
  async newsTags(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.news.listNewsTags(user, parseBody(newsTagsQuerySchema, query));
  }

  @Section("news")
  @Get("news/:slug")
  async newsPost(@Param("slug") slug: string, @CurrentUser() user: RequestUser, @Query("preview") preview?: string) {
    return this.news.getNews(slug, user, { preview: isPreviewQuery(preview) });
  }

  @Section("news")
  @Post("news/:id/like")
  async likeNews(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.news.toggleNewsLike(id, user);
  }

  @Section("news")
  @Post("news/comments/:id/like")
  async likeNewsComment(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.news.toggleNewsCommentLike(id, user);
  }

  @Section("news")
  @Post("news/:id/comments")
  async commentNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(commentInputSchema, body);
    return this.news.addNewsComment(id, user, input);
  }

  // ── Публичные: индексы цен ─────────────────────────────────────────────

  @Section("indices")
  @Get("indices")
  async indicesList(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.indices.listIndices(user, parseBody(publicContentListQuerySchema, query));
  }

  // ── Публичные: обучение ────────────────────────────────────────────────

  @Section("education")
  @Get("education/modules")
  async learningModules(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.learning.listLearningModules(user, parseBody(publicContentListQuerySchema, query));
  }

  @Section("education")
  @Get("education/modules/:id")
  async learningModule(@Param("id") id: string, @CurrentUser() user: RequestUser, @Query("preview") preview?: string) {
    return this.learning.getLearningModule(id, user, { preview: isPreviewQuery(preview) });
  }

  @Section("education")
  @Post("education/lessons/:id/complete")
  async completeLesson(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.learning.completeLesson(id, user);
  }

  // ── Публичные: база знаний ─────────────────────────────────────────────

  @Section("knowledge-base")
  @Get("knowledge-base")
  async knowledgeTree(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.knowledgeBase.knowledgeTree(user, parseBody(knowledgeTreeQuerySchema, query));
  }

  @Section("knowledge-base")
  @Get("knowledge-base/search")
  async knowledgeSearch(@Query("q") query = "", @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.searchKnowledge(query, user);
  }

  @Section("knowledge-base")
  @Get("knowledge-base/:slug")
  async knowledgeArticle(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.getKnowledgeArticle(slug, user);
  }

  // ── Админ-CMS: новости ──────────────────────────────────────────────────
  // ВНИМАНИЕ: `tags` ОБЯЗАТЕЛЬНО до `:id`, иначе NestJS зовёт getAdminNews("tags").

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/news/tags")
  async adminNewsTags() {
    return this.news.adminListNewsTags();
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/news")
  async adminListNews(@Query() query: Record<string, unknown>) {
    return this.news.adminListNews(parseBody(adminNewsListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/news/:id")
  async adminGetNews(@Param("id") id: string) {
    return this.news.getAdminNews(id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/news")
  async createNews(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(newsInputSchema, body);
    return this.news.createNews(input, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/news/:id")
  async updateNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(newsInputSchema, body);
    return this.news.updateNews(id, input, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/news/:id/publish")
  async publishNews(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.news.publishNews(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/news/:id/unpublish")
  async unpublishNews(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.news.unpublishNews(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/news/:id")
  async deleteNews(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.news.deleteNews(id, user, body?.reason);
  }

  // ── Админ-CMS: индексы цен ─────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/indices")
  async adminIndices(@Query() query: Record<string, unknown>) {
    return this.indices.adminListIndices(parseBody(adminContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/categories")
  async createCategory(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.createCategory(parseBody(categoryInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Patch("admin/content/indices/categories/:id")
  async updateCategory(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.updateCategory(id, parseBody(categoryUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/indices/categories/:id")
  async deleteCategory(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.deleteCategory(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/nomenclature")
  async createNomenclature(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.createNomenclature(parseBody(nomenclatureInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Patch("admin/content/indices/nomenclature/:id")
  async updateNomenclature(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.updateNomenclature(id, parseBody(nomenclatureUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/indices/nomenclature/:id")
  async deleteNomenclature(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.deleteNomenclature(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices")
  async createPriceIndex(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.createPriceIndex(parseBody(priceIndexInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/values")
  async addPriceValue(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.indices.addPriceValue(id, parseBody(priceIndexValueInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/indices/:id/values/:valueId")
  async deletePriceValue(@Param("id") id: string, @Param("valueId") valueId: string, @CurrentUser() user: RequestUser) {
    return this.indices.deletePriceValue(id, valueId, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/publish")
  async publishPriceIndex(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.indices.publishPriceIndex(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/:id/unpublish")
  async unpublishPriceIndex(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.unpublishPriceIndex(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/indices/:id")
  async deletePriceIndex(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.indices.deletePriceIndex(id, user, body?.reason);
  }

  // ── Админ-CMS: обучение ────────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/education")
  async adminEducation(@Query() query: Record<string, unknown>) {
    return this.learning.adminListLearningModules(parseBody(adminContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/modules")
  async createLearningModule(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.createLearningModule(parseBody(learningModuleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/education/modules/:id")
  async updateLearningModule(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.updateLearningModule(id, parseBody(learningModuleUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/modules/:id/publish")
  async publishLearningModule(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.learning.publishLearningModule(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/education/modules/:id/unpublish")
  async unpublishLearningModule(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.learning.unpublishLearningModule(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/education/modules/:id")
  async deleteLearningModule(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.learning.deleteLearningModule(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/modules/:moduleId/chapters")
  async createChapter(@Param("moduleId") moduleId: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.createChapter(moduleId, parseBody(chapterInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/education/chapters/:id")
  async updateChapter(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.updateChapter(id, parseBody(chapterUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/education/chapters/:id")
  async deleteChapter(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.learning.deleteChapter(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/chapters/:chapterId/lessons")
  async createLesson(@Param("chapterId") chapterId: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.createLesson(chapterId, parseBody(lessonInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/education/lessons/:id")
  async updateLesson(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.learning.updateLesson(id, parseBody(lessonUpdateInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/education/lessons/:id")
  async deleteLesson(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.learning.deleteLesson(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/education/lessons/:id/unpublish")
  async unpublishLesson(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.learning.unpublishLesson(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/lessons/:id/publish")
  async publishLesson(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.learning.publishLesson(id, user);
  }

  // ── Админ-CMS: база знаний ─────────────────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/knowledge-base")
  async adminKnowledge(@Query() query: Record<string, unknown>) {
    return this.knowledgeBase.adminListKnowledge(parseBody(adminContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/knowledge-base")
  async createKnowledgeArticle(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.createKnowledgeArticle(parseBody(knowledgeArticleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/knowledge-base/:id")
  async updateKnowledgeArticle(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.updateKnowledgeArticle(id, parseBody(knowledgeArticleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/knowledge-base/:id/publish")
  async publishKnowledgeArticle(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.publishKnowledgeArticle(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/knowledge-base/:id/unpublish")
  async unpublishKnowledgeArticle(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.knowledgeBase.unpublishKnowledgeArticle(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/knowledge-base/:id/move")
  async moveKnowledgeArticle(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.moveKnowledgeArticle(id, parseBody(knowledgeMoveInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/knowledge-base/:id")
  async deleteKnowledgeArticle(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.knowledgeBase.deleteKnowledgeArticle(id, user, body?.reason);
  }
}
