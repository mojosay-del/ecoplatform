import { Injectable } from "@nestjs/common";
import { PlatformSettingsService } from "../../admin/settings/platform-settings.service";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { ModuleAccessService } from "../../common/module-access.service";
import type { PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import type { z } from "zod";
import type { newsInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import {
  createNewsPost,
  deleteNewsPost,
  publishNewsPost,
  unpublishNewsPost,
  updateNewsPost,
} from "./news-admin-workflow.helpers";
import {
  addNewsComment as createNewsComment,
  toggleNewsCommentLike,
  toggleNewsPostLike,
} from "./news-interaction.helpers";
import {
  getAdminNewsPost,
  getPublishedNews,
  listAdminNews,
  listAdminNewsTags,
  listPublishedNews,
  listPublishedNewsTags,
  type NewsReadOptions,
} from "./news-read.helpers";

type NewsInput = z.infer<typeof newsInputSchema>;

// Раздел «Новости»: чтение, CRUD, теги, лайки, комментарии. Вынесен из
// 2120-строчного ContentService — теперь автономный сервис, который инжектит
// ContentCommonService для shared-хелперов (assertFunctionalAccess, payload,
// cleanupDetachedFiles и т.п.).
@Injectable()
export class NewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly moduleAccess: ModuleAccessService,
    private readonly common: ContentCommonService,
    private readonly settings: PlatformSettingsService,
  ) {}

  async listNews(user: RequestUser, paginationInput: PaginationInput & { q?: string; tags?: string[] } = {}) {
    return listPublishedNews(this.readDeps(), user, paginationInput);
  }

  async listNewsTags(user: RequestUser, options: { limit?: number } = {}) {
    return listPublishedNewsTags(this.readDeps(), user, options);
  }

  async getNews(slug: string, user: RequestUser, options: NewsReadOptions = {}) {
    return getPublishedNews(this.readDeps(), slug, user, options);
  }

  async createNews(input: NewsInput, user: RequestUser) {
    return createNewsPost(this.workflowDeps(), input, user);
  }

  async updateNews(id: string, input: NewsInput, user: RequestUser) {
    return updateNewsPost(this.workflowDeps(), id, input, user);
  }

  async publishNews(id: string, user: RequestUser) {
    return publishNewsPost(this.workflowDeps(), id, user);
  }

  async unpublishNews(id: string, user: RequestUser, reason?: string) {
    return unpublishNewsPost(this.workflowDeps(), id, user, reason);
  }

  async deleteNews(id: string, user: RequestUser, reason?: string) {
    return deleteNewsPost(this.workflowDeps(), id, user, reason);
  }

  async adminListNews(pagination: { limit?: number; offset?: number; q?: string } = {}) {
    return listAdminNews(this.readDeps(), pagination);
  }

  async adminListNewsTags() {
    return listAdminNewsTags(this.readDeps());
  }

  async getAdminNews(id: string) {
    return getAdminNewsPost(this.readDeps(), id);
  }

  async toggleNewsLike(id: string, user: RequestUser) {
    return toggleNewsPostLike(this.interactionDeps(), id, user);
  }

  async toggleNewsCommentLike(id: string, user: RequestUser) {
    return toggleNewsCommentLike(this.interactionDeps(), id, user);
  }

  async addNewsComment(newsPostId: string, user: RequestUser, input: { text: string; parentCommentId?: string }) {
    return createNewsComment(this.interactionDeps(), newsPostId, user, input);
  }

  private workflowDeps() {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      common: this.common,
    };
  }

  private readDeps() {
    return {
      prisma: this.prisma,
      common: this.common,
    };
  }

  private interactionDeps() {
    return {
      prisma: this.prisma,
      moduleAccess: this.moduleAccess,
      common: this.common,
      settings: this.settings,
    };
  }
}
