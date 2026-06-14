import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminContentListQuerySchema,
  documentationArticleInputSchema,
  documentationMoveInputSchema,
  documentationRecentQuerySchema,
  documentationTreeQuerySchema,
} from "./content.schemas";
import { DocumentationService } from "./services/documentation.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentDocumentationController {
  constructor(private readonly documentation: DocumentationService) {}

  @Get("documentation")
  async documentationTree(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.documentation.documentationTree(user, parseBody(documentationTreeQuerySchema, query));
  }

  @Get("documentation/pinned")
  async pinned(@CurrentUser() user: RequestUser) {
    return this.documentation.pinnedDocuments(user);
  }

  @Get("documentation/recent")
  async recent(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.documentation.recentDocuments(user, parseBody(documentationRecentQuerySchema, query));
  }

  @Get("documentation/search")
  async search(@Query("q") query = "", @CurrentUser() user: RequestUser) {
    return this.documentation.searchDocumentation(query, user);
  }

  @Get("documentation/:slug")
  async document(@Param("slug") slug: string, @CurrentUser() user: RequestUser) {
    return this.documentation.getDocument(slug, user);
  }

  @Get("documentation/:id/download")
  async download(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.documentation.getDownloadUrl(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Get("admin/content/documentation")
  async adminList(@Query() query: Record<string, unknown>) {
    return this.documentation.adminListDocumentation(parseBody(adminContentListQuerySchema, query));
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/documentation")
  async create(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.documentation.createDocument(parseBody(documentationArticleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/documentation/:id")
  async update(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.documentation.updateDocument(id, parseBody(documentationArticleInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Post("admin/content/documentation/:id/publish")
  async publish(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.documentation.publishDocument(id, user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Post("admin/content/documentation/:id/unpublish")
  async unpublish(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentation.unpublishDocument(id, user, body?.reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Patch("admin/content/documentation/:id/move")
  async move(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.documentation.moveDocument(id, parseBody(documentationMoveInputSchema, body), user);
  }

  @UseGuards(RolesGuard)
  @Roles("admin")
  @Delete("admin/content/documentation/:id")
  async remove(
    @Param("id") id: string,
    @Body() body: { reason?: string } | undefined,
    @CurrentUser() user: RequestUser,
  ) {
    return this.documentation.deleteDocument(id, user, body?.reason);
  }
}
