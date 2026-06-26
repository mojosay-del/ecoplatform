import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { ForumAdminService } from "./forum-admin.service";
import {
  forumAdminListQuerySchema,
  forumAnswerInputSchema,
  forumQuestionInputSchema,
  forumTaxonomyInputSchema,
  forumTaxonomyUpdateSchema,
} from "./forum.schemas";

// CMS/модерация форума. Засев и справочники — admin/content_manager;
// скрытие/удаление контента — admin/moderator (ТЗ §4).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("admin/content/forum")
export class ForumAdminController {
  constructor(private readonly forumAdmin: ForumAdminService) {}

  @Roles("admin", "content_manager", "moderator")
  @Get("questions")
  async listQuestions(@Query() query: Record<string, unknown>) {
    return this.forumAdmin.listQuestions(parseBody(forumAdminListQuerySchema, query));
  }

  @Roles("admin", "content_manager", "moderator")
  @Get("questions/:id")
  async getQuestion(@Param("id") id: string) {
    return this.forumAdmin.getQuestionForModeration(id);
  }

  @Roles("admin", "content_manager", "moderator")
  @Get("taxonomy")
  async taxonomy() {
    return this.forumAdmin.taxonomy();
  }

  // ── Справочники ─────────────────────────────────────────────────────────────
  @Roles("admin", "content_manager")
  @Post("raw-materials")
  async createRawMaterial(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.createRawMaterial(parseBody(forumTaxonomyInputSchema, body), user);
  }

  @Roles("admin", "content_manager")
  @Patch("raw-materials/:id")
  async updateRawMaterial(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.updateRawMaterial(id, parseBody(forumTaxonomyUpdateSchema, body), user);
  }

  @Roles("admin", "content_manager")
  @Delete("raw-materials/:id")
  async deleteRawMaterial(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.deleteRawMaterial(id, user);
  }

  @Roles("admin", "content_manager")
  @Post("question-types")
  async createQuestionType(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.createQuestionType(parseBody(forumTaxonomyInputSchema, body), user);
  }

  @Roles("admin", "content_manager")
  @Patch("question-types/:id")
  async updateQuestionType(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.updateQuestionType(id, parseBody(forumTaxonomyUpdateSchema, body), user);
  }

  @Roles("admin", "content_manager")
  @Delete("question-types/:id")
  async deleteQuestionType(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.deleteQuestionType(id, user);
  }

  // ── Засев ───────────────────────────────────────────────────────────────────
  @Roles("admin", "content_manager")
  @Post("questions")
  async seedQuestion(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.seedQuestion(parseBody(forumQuestionInputSchema, body), user);
  }

  @Roles("admin", "content_manager")
  @Post("questions/:id/answers")
  async seedAnswer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.seedAnswer(id, parseBody(forumAnswerInputSchema, body), user);
  }

  // ── Модерация ───────────────────────────────────────────────────────────────
  @Roles("admin", "moderator")
  @Post("questions/:id/hide")
  async hideQuestion(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.hideQuestion(id, user);
  }

  @Roles("admin", "moderator")
  @Post("questions/:id/restore")
  async restoreQuestion(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.restoreQuestion(id, user);
  }

  @Roles("admin", "moderator")
  @Delete("questions/:id")
  async deleteQuestion(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.deleteQuestion(id, user);
  }

  @Roles("admin", "moderator")
  @Post("answers/:id/hide")
  async hideAnswer(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.hideAnswer(id, user);
  }

  @Roles("admin", "moderator")
  @Post("answers/:id/restore")
  async restoreAnswer(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.restoreAnswer(id, user);
  }

  @Roles("admin", "moderator")
  @Delete("answers/:id")
  async deleteAnswer(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forumAdmin.deleteAnswer(id, user);
  }
}
