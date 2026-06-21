import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { slugify } from "@ecoplatform/shared";
import { assertFunctionalAccess } from "../../common/access-policy";
import { sanitizeParagraphHtml } from "../../common/sanitize-html";
import type { RequestUser } from "../../common/request-user";
import { FilesService } from "../../files/files.service";

// Хелперы, которыми пользуются ВСЕ доменные сервисы content-домена
// (News/Indices/Learning/Knowledge). Без этого «общего знаменателя»
// раньше всё лежало в одном 2120-строчном ContentService.
@Injectable()
export class ContentCommonService {
  constructor(private readonly files: FilesService) {}

  // Центральная для MVP проверка: после истечения demo пользователь может
  // войти в кабинет, но рабочие разделы закрываются до активации подписки.
  // Платформенные сотрудники проходят всегда.
  assertFunctionalAccess(user: RequestUser) {
    assertFunctionalAccess(user);
  }

  // Готовит payload блока для записи в БД. Для paragraph — сначала прогоняет
  // HTML через единый shared-санитайзер.
  //
  // В payload автоматически вставляется ключ `v: 1` (Волна 7.7). Это
  // версия формата блока — нужна, чтобы в будущем подключить второй парсер
  // (например, paragraph v2 с inline-форматированием) без массовой миграции
  // старых строк.
  payload(block: { type: string; payload: unknown }): Prisma.InputJsonValue {
    if (block.type === "paragraph") {
      const { html } = block.payload as { html: string };
      return { v: 1, html: sanitizeParagraphHtml(html) } as Prisma.InputJsonValue;
    }
    const original = (block.payload as Record<string, unknown>) ?? {};
    return { v: 1, ...original } as Prisma.InputJsonValue;
  }

  // Рекурсивно собирает все fileId, упомянутые внутри payload блоков.
  // Используется при unpublish/delete, чтобы передать «осиротевшие» файлы
  // в files.deleteIfUnreferenced.
  collectFileIdsFromPayload(payload: unknown, fileIds = new Set<string>()): Set<string> {
    if (!payload || typeof payload !== "object") {
      return fileIds;
    }
    if (Array.isArray(payload)) {
      payload.forEach((value) => this.collectFileIdsFromPayload(value, fileIds));
      return fileIds;
    }
    const record = payload as Record<string, unknown>;
    if (typeof record.fileId === "string" && record.fileId) {
      fileIds.add(record.fileId);
    }
    Object.values(record).forEach((value) => this.collectFileIdsFromPayload(value, fileIds));
    return fileIds;
  }

  collectFileIdsFromBlocks(blocks: Array<{ payload: unknown }>): string[] {
    const fileIds = new Set<string>();
    blocks.forEach((block) => this.collectFileIdsFromPayload(block.payload, fileIds));
    return Array.from(fileIds);
  }

  compactFileIds(ids: Array<string | null | undefined>): string[] {
    return Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  }

  async cleanupDetachedFiles(ids: Array<string | null | undefined>): Promise<void> {
    const fileIds = this.compactFileIds(ids);
    if (fileIds.length === 0) {
      return;
    }
    await this.files.deleteIfUnreferenced(fileIds);
  }

  async assertCoverImageAllowed(fileId: string | null | undefined, user: RequestUser): Promise<void> {
    await this.files.assertCoverImageAllowed(fileId, user);
  }

  // Зарегистрировать ВСЕ файлы, на которые ссылается данная сущность (новость,
  // модуль, статья базы знаний…), в FileReference. Идемпотентно: старые
  // ссылки этой же entity (entityType, entityId) сначала удаляются, потом
  // вставляются текущие. Вызывайте после каждого create/update сущности.
  async recordEntityReferences(
    entityType: string,
    entityId: string,
    fileIds: Array<string | null | undefined>,
  ): Promise<void> {
    await this.files.replaceFileReferences(entityType, entityId, fileIds);
  }

  // Удалить все ссылки сущности — вызывайте перед удалением.
  async clearEntityReferences(entityType: string, entityId: string): Promise<void> {
    await this.files.clearFileReferences(entityType, entityId);
  }

  // Генерирует уникальный slug, добавляя суффикс `-2`, `-3` ... пока
  // `exists(candidate)` возвращает true. Используется и для новостей, и для
  // модулей обучения, и для статей базы знаний — везде свой уникальный индекс.
  async uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
    const root = slugify(base);
    let candidate = root;
    let index = 2;
    while (await exists(candidate)) {
      candidate = `${root}-${index}`;
      index += 1;
    }
    return candidate;
  }
}
