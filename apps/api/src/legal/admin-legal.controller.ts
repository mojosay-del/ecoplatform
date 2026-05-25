import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";
import { legalDocumentCreateDtoSchema } from "@ecoplatform/shared";
import { AdminActionLogService } from "../common/admin-action-log.service";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { Roles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { LegalService } from "./legal.service";

// Управление юр-документами: создание новых версий и активация. Доступно
// только admin и content_manager (контент-менеджер обновляет тексты,
// admin — нажимает «опубликовать»).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles("admin", "content_manager")
@Controller("admin/legal/documents")
export class AdminLegalController {
  constructor(
    private readonly service: LegalService,
    private readonly auditLog: AdminActionLogService,
  ) {}

  @Get()
  async list() {
    return this.service.adminListDocuments();
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: RequestUser) {
    const input = parseBody(legalDocumentCreateDtoSchema, body);
    const created = await this.service.adminCreateDocument(input);
    await this.auditLog.record({
      actorId: user.id,
      action: "admin.legal.document.create",
      entityType: "LegalDocument",
      entityId: created.id,
      payload: { type: created.type, version: created.version, isRequired: created.isRequired },
    });
    return created;
  }

  @Post(":id/publish")
  async publish(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    const published = await this.service.adminPublishDocument(id);
    await this.auditLog.record({
      actorId: user.id,
      action: "admin.legal.document.publish",
      entityType: "LegalDocument",
      entityId: published.id,
      payload: { type: published.type, version: published.version },
    });
    return published;
  }
}
