import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { LegalDocumentType, consentSubmitDtoSchema, legalDocumentTypes } from "@ecoplatform/shared";
import { CurrentUser } from "../common/current-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import type { RequestUser } from "../common/request-user";
import { parseBody } from "../common/zod";
import { LegalService } from "./legal.service";

@Controller("legal")
export class LegalController {
  constructor(private readonly service: LegalService) {}

  // Публично, без auth. Поддерживает фильтр `?types=privacy_policy,terms_of_service`
  // — нужен на странице регистрации, чтобы получить только обязательные документы.
  @Get("documents")
  @SkipThrottle({ short: true, long: true, auth: true })
  async listDocuments(@Query("types") types?: string) {
    const filtered = parseTypesQuery(types);
    return this.service.listActiveDocuments(filtered);
  }

  @Get("documents/:type/:version")
  @SkipThrottle({ short: true, long: true, auth: true })
  async getDocument(@Param("type") type: string, @Param("version") version: string) {
    return this.service.getDocument(parseType(type), version);
  }

  // Авторизованный пользователь подтверждает согласие на список документов.
  @Post("consents")
  @UseGuards(JwtAuthGuard)
  async submitConsents(@Body() body: unknown, @CurrentUser() user: RequestUser, @Req() request: Request) {
    const input = parseBody(consentSubmitDtoSchema, body);
    await this.service.recordConsents(user.id, input.documentIds, {
      source: input.source,
      ipAddress: extractIp(request),
      userAgent: request.get("user-agent") ?? null,
    });
    return { ok: true };
  }

  // Список согласий текущего пользователя — для /account → Безопасность.
  @Get("me/consents")
  @UseGuards(JwtAuthGuard)
  async listMyConsents(@CurrentUser() user: RequestUser) {
    return this.service.listUserConsents(user.id);
  }
}

function parseType(value: string): LegalDocumentType {
  if (!legalDocumentTypes.includes(value as LegalDocumentType)) {
    throw new Error("Неизвестный тип документа");
  }
  return value as LegalDocumentType;
}

function parseTypesQuery(value?: string): LegalDocumentType[] | undefined {
  if (!value) return undefined;
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter((p): p is LegalDocumentType => legalDocumentTypes.includes(p as LegalDocumentType));
  return parts.length ? parts : undefined;
}

function extractIp(request: Request): string | null {
  // app.set('trust proxy', 1) уже включён в main.ts — request.ip учитывает X-Forwarded-For.
  const ip = request.ip ?? null;
  if (!ip) return null;
  // IPv4-mapped IPv6 ::ffff:1.2.3.4 — приводим к читаемому виду.
  return ip.startsWith("::ffff:") ? ip.slice("::ffff:".length) : ip;
}
