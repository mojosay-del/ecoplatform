import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { ForumService } from "./forum.service";
import {
  forumAcceptInputSchema,
  forumAnswerInputSchema,
  forumListQuerySchema,
  forumQuestionInputSchema,
  forumQuestionUpdateSchema,
} from "./forum.schemas";

@UseGuards(JwtAuthGuard)
@Controller("forum")
export class ForumController {
  constructor(private readonly forum: ForumService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: Record<string, unknown>) {
    return this.forum.list(user, parseBody(forumListQuerySchema, query));
  }

  @Get("pinned-news")
  async pinnedNews(@CurrentUser() user: RequestUser) {
    return this.forum.pinnedNews(user);
  }

  @Get("taxonomy")
  async taxonomy(@CurrentUser() user: RequestUser) {
    return this.forum.taxonomy(user);
  }

  @Get("summary")
  async summary(@CurrentUser() user: RequestUser) {
    return this.forum.summary(user);
  }

  @Get("q/:id")
  async question(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.getQuestion(id, user);
  }

  @Post("q")
  async ask(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forum.ask(parseBody(forumQuestionInputSchema, body), user);
  }

  @Patch("q/:id")
  async updateQuestion(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forum.updateQuestion(id, parseBody(forumQuestionUpdateSchema, body), user);
  }

  @Delete("q/:id")
  async deleteQuestion(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.deleteQuestion(id, user);
  }

  @Post("q/:id/answers")
  async answer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forum.answer(id, parseBody(forumAnswerInputSchema, body), user);
  }

  @Post("q/:id/accept")
  async accept(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forum.accept(id, parseBody(forumAcceptInputSchema, body), user);
  }

  @Post("q/:id/subscribe")
  async subscribe(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.subscribe(id, user);
  }

  @Delete("q/:id/subscribe")
  async unsubscribe(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.unsubscribe(id, user);
  }

  @Patch("answers/:id")
  async updateAnswer(@Param("id") id: string, @Body() body: unknown, @CurrentUser() user: RequestUser) {
    return this.forum.updateAnswer(id, parseBody(forumAnswerInputSchema, body), user);
  }

  @Delete("answers/:id")
  async deleteAnswer(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.deleteAnswer(id, user);
  }

  @Post("answers/:id/vote")
  async vote(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.forum.vote(id, user);
  }
}
