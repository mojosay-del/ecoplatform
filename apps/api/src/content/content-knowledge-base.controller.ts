import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminContentListQuerySchema,
  knowledgeArticleInputSchema,
  knowledgeMoveInputSchema,
  knowledgeTreeQuerySchema,
  optionalReasonBodySchema,
} from "./content.schemas";
import { KnowledgeBaseService } from "./services/knowledge-base.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentKnowledgeBaseController {
  constructor(private readonly knowledgeBase: KnowledgeBaseService) {}

  @Get("knowledge-base")
  async knowledgeTree(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.knowledgeBase.knowledgeTree(user, parseBody(knowledgeTreeQuerySchema, query));
  }

  @Get("knowledge-base/search")
  async knowledgeSearch(@Query("q") query = "", @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.searchKnowledge(query, user);
  }

  @Get("knowledge-base/:slug")
  async knowledgeArticle(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.getKnowledgeArticle(slug, user);
  }

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
  async unpublishKnowledgeArticle(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.unpublishKnowledgeArticle(id, user, parseBody(optionalReasonBodySchema, body).reason);
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
  async deleteKnowledgeArticle(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.knowledgeBase.deleteKnowledgeArticle(id, user, parseBody(optionalReasonBodySchema, body).reason);
  }
}
