import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  categoryInputSchema,
  commentInputSchema,
  knowledgeArticleInputSchema,
  learningModuleInputSchema,
  newsInputSchema,
  nomenclatureInputSchema,
  priceIndexInputSchema,
  priceIndexValueInputSchema,
} from "./content.schemas";
import { ContentService } from "./content.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentController {
  constructor(private readonly content: ContentService) {}

  @Get("news")
  async news(@CurrentUser() user: RequestUser) {
    return this.content.listNews(user);
  }

  @Get("news/:slug")
  async newsPost(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.content.getNews(slug, user);
  }

  @Post("news/:id/like")
  async likeNews(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.content.toggleNewsLike(id, user);
  }

  @Post("news/:id/comments")
  async commentNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(commentInputSchema, body);
    return this.content.addNewsComment(id, user, input);
  }

  @Get("indices")
  async indices(@CurrentUser() user: RequestUser) {
    return this.content.listIndices(user);
  }

  @Get("education/modules")
  async learningModules(@CurrentUser() user: RequestUser) {
    return this.content.listLearningModules(user);
  }

  @Get("education/modules/:id")
  async learningModule(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.content.getLearningModule(id, user);
  }

  @Post("education/lessons/:id/complete")
  async completeLesson(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.content.completeLesson(id, user);
  }

  @Get("knowledge-base")
  async knowledgeTree(@CurrentUser() user: RequestUser) {
    return this.content.knowledgeTree(user);
  }

  @Get("knowledge-base/search")
  async knowledgeSearch(@Query("q") query = "", @CurrentUser() user: RequestUser) {
    return this.content.searchKnowledge(query, user);
  }

  @Get("knowledge-base/:slug")
  async knowledgeArticle(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.content.getKnowledgeArticle(slug, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/news")
  async adminNews() {
    return this.content.adminListNews();
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/news")
  async createNews(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(newsInputSchema, body);
    return this.content.createNews(input, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/news/:id")
  async updateNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(newsInputSchema, body);
    return this.content.updateNews(id, input, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/news/:id/publish")
  async publishNews(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.content.publishNews(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/news/:id/unpublish")
  async unpublishNews(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.unpublishNews(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/news/:id")
  async deleteNews(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.content.deleteNews(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/indices")
  async adminIndices() {
    return this.content.adminListIndices();
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/categories")
  async createCategory(@Body() body: unknown) {
    return this.content.createCategory(parseBody(categoryInputSchema, body));
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/indices/nomenclature")
  async createNomenclature(@Body() body: unknown) {
    return this.content.createNomenclature(parseBody(nomenclatureInputSchema, body));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices")
  async createPriceIndex(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.content.createPriceIndex(parseBody(priceIndexInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/values")
  async addPriceValue(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.content.addPriceValue(id, parseBody(priceIndexValueInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/indices/:id/publish")
  async publishPriceIndex(@Param("id") id: string) {
    return this.content.publishPriceIndex(id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/education")
  async adminEducation() {
    return this.content.adminListLearningModules();
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/modules")
  async createLearningModule(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.content.createLearningModule(parseBody(learningModuleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/education/modules/:id/publish")
  async publishLearningModule(@Param("id") id: string) {
    return this.content.publishLearningModule(id);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/knowledge-base")
  async adminKnowledge() {
    return this.content.adminListKnowledge();
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/knowledge-base")
  async createKnowledgeArticle(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.content.createKnowledgeArticle(parseBody(knowledgeArticleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/knowledge-base/:id/publish")
  async publishKnowledgeArticle(@Param("id") id: string) {
    return this.content.publishKnowledgeArticle(id);
  }
}
