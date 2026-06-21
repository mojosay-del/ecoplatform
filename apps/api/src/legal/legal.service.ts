import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { LegalDocument, LegalDocumentType, Prisma } from "@prisma/client";
import type {
  ConsentRecordItem,
  ConsentSource,
  LegalDocumentCreateDto,
  LegalDocumentDetail,
  LegalDocumentSummary,
} from "@ecoplatform/shared";
import { sanitizeParagraphHtml } from "../common/sanitize-html";
import { PrismaService } from "../prisma/prisma.service";

// Контекст пользователя для записи `ConsentRecord` (IP и user-agent — для
// аудита 152-ФЗ. ipAddress читается из `request.ip` с trust proxy=1).
export type ConsentContext = {
  source?: ConsentSource;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public ──────────────────────────────────────────────────────────────

  // Активные версии — то, что сейчас обязан/может видеть пользователь.
  // Если передан фильтр `types`, выдаются только эти типы (используется
  // на странице регистрации).
  async listActiveDocuments(types?: LegalDocumentType[]): Promise<LegalDocumentSummary[]> {
    const documents = await this.prisma.legalDocument.findMany({
      where: {
        isActive: true,
        ...(types && types.length ? { type: { in: types } } : {}),
      },
      orderBy: [{ type: "asc" }, { publishedAt: "desc" }],
    });
    return documents.map(toSummary);
  }

  async getDocument(type: LegalDocumentType, version: string): Promise<LegalDocumentDetail> {
    const document = await this.prisma.legalDocument.findUnique({
      where: { type_version: { type, version } },
    });
    if (!document || !document.publishedAt) {
      throw new NotFoundException("Документ не найден.");
    }
    return toDetail(document);
  }

  // Сценарии:
  // 1. Регистрация. Передаёт `documentIds` всех принятых документов с галочек,
  //    бэк проверяет, что среди них есть все обязательные активные документы
  //    (privacy_policy, terms_of_service, personal_data_consent) и записывает
  //    `ConsentRecord` через эту же ручку (внутри auth.service.register).
  // 2. Re-consent при обновлении документа. UI на основании
  //    `auth/me.requiresReConsent` показывает модалку, пользователь жмёт
  //    «Принять», web шлёт POST /legal/consents с `source: login_reconfirm`.
  // 3. Cookie-banner. Web шлёт `source: cookie_banner` с ID активной версии
  //    cookie_policy (и, опционально, marketing_consent при «Принять все»).
  async recordConsents(userId: string, documentIds: string[], context: ConsentContext = {}): Promise<void> {
    if (!documentIds.length) return;
    const uniqueIds = Array.from(new Set(documentIds));
    const documents = await this.prisma.legalDocument.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true, isActive: true },
    });
    if (documents.length !== uniqueIds.length) {
      throw new BadRequestException("Один или несколько документов не найдены.");
    }
    const inactive = documents.filter((d) => !d.isActive);
    if (inactive.length) {
      throw new BadRequestException("Нельзя подтвердить неактивную версию документа.");
    }

    const source: ConsentSource = context.source ?? "settings";
    const data: Prisma.ConsentRecordCreateManyInput[] = uniqueIds.map((documentId) => ({
      userId,
      documentId,
      source,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent ?? null,
    }));
    await this.prisma.consentRecord.createMany({ data, skipDuplicates: true });
  }

  async listUserConsents(userId: string): Promise<ConsentRecordItem[]> {
    const records = await this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { acceptedAt: "desc" },
      include: { document: true },
    });
    return records.map((record) => ({
      id: record.id,
      documentId: record.documentId,
      acceptedAt: record.acceptedAt.toISOString(),
      source: record.source as ConsentSource,
      document: toSummary(record.document),
    }));
  }

  // Возвращает обязательные активные документы, на которые у пользователя
  // ещё нет `ConsentRecord`. Если массив не пуст — фронт показывает модалку
  // re-consent. Маркетинг и cookies исключены (`isRequired=false`).
  async pendingRequiredConsents(userId: string): Promise<LegalDocumentSummary[]> {
    const required = await this.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
    });
    if (!required.length) return [];
    const acceptedIds = new Set(
      (
        await this.prisma.consentRecord.findMany({
          where: { userId, documentId: { in: required.map((d) => d.id) } },
          select: { documentId: true },
        })
      ).map((r) => r.documentId),
    );
    return required.filter((d) => !acceptedIds.has(d.id)).map(toSummary);
  }

  // Проверяет, что в `proposedIds` есть все обязательные активные документы.
  // Используется при регистрации: пользователь не сможет зарегистрироваться,
  // не приняв обязательные документы (контроль и в UI, и на бэке).
  async assertRequiredAccepted(proposedIds: string[]): Promise<LegalDocument[]> {
    const requiredActive = await this.prisma.legalDocument.findMany({
      where: { isActive: true, isRequired: true },
    });
    const proposed = new Set(proposedIds);
    const missing = requiredActive.filter((d) => !proposed.has(d.id));
    if (missing.length) {
      throw new BadRequestException(
        "Не подтверждены обязательные документы: " + missing.map((d) => d.title).join(", "),
      );
    }
    // Возвращаем все документы, которые надо записать (только активные и в
    // составе пришедшего proposedIds). Это позволяет вызывающему коду
    // не делать второй запрос за активными.
    const allActive = await this.prisma.legalDocument.findMany({
      where: { isActive: true, id: { in: proposedIds } },
    });
    return allActive;
  }

  // ── Admin ───────────────────────────────────────────────────────────────

  async adminListDocuments(): Promise<LegalDocumentDetail[]> {
    const documents = await this.prisma.legalDocument.findMany({
      orderBy: [{ type: "asc" }, { createdAt: "desc" }],
    });
    return documents.map(toDetail);
  }

  async adminCreateDocument(input: LegalDocumentCreateDto): Promise<LegalDocumentDetail> {
    const sanitizedBody = sanitizeParagraphHtml(input.body);
    if (!sanitizedBody.trim()) {
      throw new BadRequestException("Тело документа после очистки пустое.");
    }
    try {
      const created = await this.prisma.legalDocument.create({
        data: {
          type: input.type as LegalDocumentType,
          version: input.version,
          title: input.title,
          summary: input.summary ?? null,
          body: sanitizedBody,
          isRequired: input.isRequired,
          isActive: false,
        },
      });
      return toDetail(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Документ этого типа с такой версией уже существует.");
      }
      throw error;
    }
  }

  // Активация: целевая версия становится активной, все предыдущие активные
  // того же типа — деактивируются. Транзакция гарантирует, что у каждого
  // типа в один момент времени активна ровно одна версия (или ноль до
  // первой публикации).
  async adminPublishDocument(id: string): Promise<LegalDocumentDetail> {
    const target = await this.prisma.legalDocument.findUnique({ where: { id } });
    if (!target) {
      throw new NotFoundException("Документ не найден.");
    }
    if (target.isActive) {
      return toDetail(target);
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.legalDocument.updateMany({
        where: { type: target.type, isActive: true },
        data: { isActive: false },
      });
      return tx.legalDocument.update({
        where: { id: target.id },
        data: { isActive: true, publishedAt: new Date() },
      });
    });
    return toDetail(updated);
  }
}

function toSummary(doc: LegalDocument): LegalDocumentSummary {
  return {
    id: doc.id,
    type: doc.type as LegalDocumentType,
    version: doc.version,
    title: doc.title,
    summary: doc.summary,
    isRequired: doc.isRequired,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
  };
}

function toDetail(doc: LegalDocument): LegalDocumentDetail {
  return {
    ...toSummary(doc),
    body: sanitizeParagraphHtml(doc.body),
    isActive: doc.isActive,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}
