import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminContentListQuerySchema,
  chapterInputSchema,
  chapterUpdateInputSchema,
  learningModuleInputSchema,
  learningModuleUpdateInputSchema,
  lessonInputSchema,
  lessonUpdateInputSchema,
  publicContentListQuerySchema,
} from "./content.schemas";
import { isPreviewQuery } from "./content-query.helpers";
import { LearningService } from "./services/learning.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentLearningController {
  constructor(private readonly learning: LearningService) {}

  @Get("education/modules")
  async learningModules(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.learning.listLearningModules(user, parseBody(publicContentListQuerySchema, query));
  }

  @Get("education/modules/:id")
  async learningModule(@Param("id") id: string, @CurrentUser() user: RequestUser, @Query("preview") preview?: string) {
    return this.learning.getLearningModule(id, user, { preview: isPreviewQuery(preview) });
  }

  @Post("education/lessons/:id/complete")
  async completeLesson(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.learning.completeLesson(id, user);
  }

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
}
