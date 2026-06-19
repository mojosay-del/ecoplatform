import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import {
  adminNewsListQuerySchema,
  commentInputSchema,
  newsInputSchema,
  newsListQuerySchema,
  newsTagsQuerySchema,
  optionalReasonBodySchema,
} from "./content.schemas";
import { isPreviewQuery, parseStringArrayQuery } from "./content-query.helpers";
import { NewsService } from "./services/news.service";

@UseGuards(JwtAuthGuard)
@Controller()
export class ContentNewsController {
  constructor(private readonly news: NewsService) {}

  @Get("news")
  async listNews(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    const input = parseBody(newsListQuerySchema, query);
    return this.news.listNews(user, {
      limit: input.limit,
      offset: input.offset,
      page: input.page,
      q: input.q,
      take: input.take,
      tags: parseStringArrayQuery(input.tags, input["tags[]"]),
    });
  }

  @Get("news/tags")
  async newsTags(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.news.listNewsTags(user, parseBody(newsTagsQuerySchema, query));
  }

  @Get("news/:slug")
  async newsPost(@Param("slug") slug: string, @CurrentUser() user: RequestUser, @Query("preview") preview?: string) {
    return this.news.getNews(slug, user, { preview: isPreviewQuery(preview) });
  }

  @Post("news/:id/like")
  async likeNews(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.news.toggleNewsLike(id, user);
  }

  @Post("news/comments/:id/like")
  async likeNewsComment(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.news.toggleNewsCommentLike(id, user);
  }

  @Post("news/:id/comments")
  async commentNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(commentInputSchema, body);
    return this.news.addNewsComment(id, user, input);
  }

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
  async unpublishNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.news.unpublishNews(id, user, parseBody(optionalReasonBodySchema, body).reason);
  }

  @UseGuards(RolesGuard)
  @Roles("admin", "content_manager")
  @Delete("admin/content/news/:id")
  async deleteNews(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.news.deleteNews(id, user, parseBody(optionalReasonBodySchema, body).reason);
  }
}
