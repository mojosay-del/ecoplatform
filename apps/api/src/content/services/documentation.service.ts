import { Injectable, NotFoundException } from "@nestjs/common";
import { ContentStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActionLogService } from "../../common/admin-action-log.service";
import { paginatedResponse, resolvePagination, type PaginationInput } from "../../common/pagination";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";
import type { z } from "zod";
import type { documentationArticleInputSchema } from "../content.schemas";
import { ContentCommonService } from "./content-common.service";
import { buildDocumentationTreeInclude } from "./documentation-tree.helpers";
import {
  createDocumentationArticle,
  deleteDocumentationArticle,
  moveDocumentationArticle,
  publishDocumentationArticle,
  unpublishDocumentationArticle,
  updateDocumentationArticle,
} from "./documentation-admin-workflow.helpers";
import {
  DOCUMENT_LEAF_FILTER,
  mapDocumentationDetail,
  mapDocumentationNode,
  type DocumentationArticleRow,
} from "./documentation-response.helpers";

type DocumentationInput = z.infer<typeof documentationArticleInputSchema>;

const RECENT_DEFAULT_LIMIT = 8;
const PINNED_LIMIT = 12;

// База документации: дерево разделов (category) → документы, до 3 уровней. По
// механике — близнец KnowledgeBaseService (позиции/глубина/файлы вынесены в
// documentation-{position,depth,tree,response}.helpers), но документ —
// первоклассная сущность: прикреплённый файл, формат, версия, «действует с»,
// закрепление («часто нужные») и revisedAt («недавно обновлено»).
@Injectable()
export class DocumentationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AdminActionLogService,
    private readonly common: ContentCommonService,
    private readonly files: FilesService,
  ) {}

  async documentationTree(user: RequestUser, options: { limit?: number; depth?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const width = resolvePagination({ limit: options.limit }, { defaultLimit: 100, maxLimit: 200 }).limit;
    const rawDepth = Number.isFinite(options.depth) ? Math.trunc(options.depth!) : 3;
    const depth = Math.min(Math.max(rawDepth, 1), 3);

    const rows = (await this.prisma.documentationArticle.findMany({
      where: { parentId: null, status: ContentStatus.published },
      orderBy: { position: "asc" },
      take: width,
      include: buildDocumentationTreeInclude(depth, width),
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row, { includeChildren: true }));
  }

  // «Часто нужные» — закреплённые документы (admin их курирует). Свежезакреплённые
  // и недавно тронутые — выше.
  async pinnedDocuments(user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const rows = (await this.prisma.documentationArticle.findMany({
      where: { status: ContentStatus.published, isPinned: true },
      orderBy: { updatedAt: "desc" },
      take: PINNED_LIMIT,
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  // «Недавно обновлено» — документы (не разделы), отсортированные по дате
  // последнего существенного изменения. revisedAt у опубликованных документов
  // всегда заполнен (см. publish), поэтому сортировка стабильна.
  async recentDocuments(user: RequestUser, options: { limit?: number } = {}) {
    this.common.assertFunctionalAccess(user);
    const take = Math.min(Math.max(Math.trunc(options.limit ?? RECENT_DEFAULT_LIMIT), 1), 50);
    const rows = (await this.prisma.documentationArticle.findMany({
      where: { status: ContentStatus.published, ...DOCUMENT_LEAF_FILTER },
      orderBy: { revisedAt: "desc" },
      take,
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  async searchDocumentation(query: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return [];
    }
    const rows = (await this.prisma.documentationArticle.findMany({
      where: {
        status: ContentStatus.published,
        AND: [
          DOCUMENT_LEAF_FILTER,
          {
            OR: [
              { title: { contains: trimmed, mode: "insensitive" } },
              { subtitle: { contains: trimmed, mode: "insensitive" } },
            ],
          },
        ],
      },
      take: 50,
      orderBy: { title: "asc" },
      include: { file: true },
    })) as DocumentationArticleRow[];

    return rows.map((row) => mapDocumentationNode(row));
  }

  async getDocument(slug: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const row = (await this.prisma.documentationArticle.findUnique({
      where: { slug },
      include: {
        file: true,
        blocks: { orderBy: { position: "asc" } },
        parent: { include: { parent: true } },
      },
    })) as DocumentationArticleRow | null;

    if (
      !row ||
      row.status !== ContentStatus.published ||
      row.parent?.status === ContentStatus.draft ||
      row.parent?.parent?.status === ContentStatus.draft
    ) {
      throw new NotFoundException("Документ не найден.");
    }

    return mapDocumentationDetail(row);
  }

  // Свежая presigned-ссылка на приватный файл документа. Доступ — как у чтения:
  // подписка + опубликованность (платформенный персонал проходит всегда).
  async getDownloadUrl(id: string, user: RequestUser) {
    this.common.assertFunctionalAccess(user);
    const row = await this.prisma.documentationArticle.findUnique({
      where: { id },
      include: { file: true, parent: { include: { parent: true } } },
    });

    if (!row) {
      throw new NotFoundException("Документ не найден.");
    }

    const isStaff = user.platformRoles.length > 0;
    const visible =
      row.status === ContentStatus.published &&
      row.parent?.status !== ContentStatus.draft &&
      row.parent?.parent?.status !== ContentStatus.draft;
    if (!isStaff && !visible) {
      throw new NotFoundException("Документ не найден.");
    }
    if (!row.file) {
      throw new NotFoundException("У документа нет прикреплённого файла.");
    }

    const url = await this.files.createSignedDownloadUrl(row.file);
    return { url };
  }

  async adminListDocumentation(paginationInput: PaginationInput = {}) {
    const pagination = resolvePagination(paginationInput, { defaultLimit: 100, maxLimit: 200 });
    const [total, items] = await this.prisma.$transaction([
      this.prisma.documentationArticle.count(),
      this.prisma.documentationArticle.findMany({
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        take: pagination.limit,
        skip: pagination.offset,
        include: { file: true, blocks: { orderBy: { position: "asc" } } },
      }),
    ]);

    const mapped = (items as DocumentationArticleRow[]).map((row) =>
      mapDocumentationNode(row, { includeBlocks: true }),
    );
    return paginatedResponse(mapped, total, pagination);
  }

  async createDocument(input: DocumentationInput, user: RequestUser) {
    return createDocumentationArticle(this.workflowDeps(), input, user);
  }

  async updateDocument(id: string, input: DocumentationInput, user: RequestUser) {
    return updateDocumentationArticle(this.workflowDeps(), id, input, user);
  }

  async publishDocument(id: string, user: RequestUser) {
    return publishDocumentationArticle(this.workflowDeps(), id, user);
  }

  async unpublishDocument(id: string, user: RequestUser, reason?: string) {
    return unpublishDocumentationArticle(this.workflowDeps(), id, user, reason);
  }

  async moveDocument(id: string, input: { parentId: string | null; position: number }, user: RequestUser) {
    return moveDocumentationArticle(this.workflowDeps(), id, input, user);
  }

  async deleteDocument(id: string, user: RequestUser, reason?: string) {
    return deleteDocumentationArticle(this.workflowDeps(), id, user, reason);
  }

  private workflowDeps() {
    return {
      prisma: this.prisma,
      auditLog: this.auditLog,
      common: this.common,
    };
  }
}
