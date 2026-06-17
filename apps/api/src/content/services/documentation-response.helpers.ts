import type { DocumentationArticle, DocumentationBlock, FileAsset, Prisma } from "@prisma/client";
import type {
  DocumentationBreadcrumb,
  DocumentationDetail,
  DocumentationFileMeta,
  DocumentationNode,
} from "@ecoplatform/shared";

// Узел документации в том виде, как он приходит из Prisma с подгруженными
// связями (file/blocks/children/parent). Поля опциональны — каждый запрос
// тянет ровно то, что нужно (дерево — file+children, страница — file+blocks).
export type DocumentationArticleRow = DocumentationArticle & {
  file?: FileAsset | null;
  blocks?: DocumentationBlock[];
  children?: DocumentationArticleRow[];
  parent?: (DocumentationArticle & { parent?: DocumentationArticle | null }) | null;
};

// where-фильтр «только документы» (не разделы). У документов iconType = null,
// у разделов = "category". Простое `not: "category"` отбросило бы NULL-строки,
// поэтому собираем явный OR.
export const DOCUMENT_LEAF_FILTER: Prisma.DocumentationArticleWhereInput = {
  OR: [{ iconType: null }, { iconType: { not: "category" } }],
};

const MIME_FORMAT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/zip": "zip",
  "application/x-rar-compressed": "rar",
  "text/csv": "csv",
  "text/plain": "txt",
  "application/rtf": "rtf",
};

// Нормализованный формат документа: расширение файла в нижнем регистре, иначе —
// маппинг по mime-типу, иначе "file". Frontend (documentFormats.ts) раскрашивает
// известные форматы (pdf/docx/xlsx/…), остальные показывает нейтрально.
export function documentationFileFormat(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot >= 0 && dot < fileName.length - 1) {
    return fileName.slice(dot + 1).toLowerCase();
  }
  return MIME_FORMAT[mimeType] ?? "file";
}

function fileMeta(file?: FileAsset | null): DocumentationFileMeta | null {
  if (!file) {
    return null;
  }
  return {
    id: file.id,
    fileName: file.originalName,
    format: documentationFileFormat(file.originalName, file.mimeType),
    sizeBytes: file.sizeBytes,
  };
}

function mapBlocks(blocks?: DocumentationBlock[]) {
  return (blocks ?? []).map((block) => ({
    id: block.id,
    position: block.position,
    type: block.type,
    payload: block.payload as Record<string, unknown>,
  }));
}

export function mapDocumentationNode(
  row: DocumentationArticleRow,
  options: { includeChildren?: boolean; includeBlocks?: boolean } = {},
): DocumentationNode {
  const node: DocumentationNode = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    iconType: row.iconType,
    displayIcon: row.displayIcon,
    parentId: row.parentId,
    position: row.position,
    status: row.status,
    isPinned: row.isPinned,
    version: row.version,
    effectiveDate: row.effectiveDate ? row.effectiveDate.toISOString() : null,
    firstPublishedAt: row.firstPublishedAt ? row.firstPublishedAt.toISOString() : null,
    revisedAt: row.revisedAt ? row.revisedAt.toISOString() : null,
    file: fileMeta(row.file),
  };
  if (options.includeBlocks) {
    node.blocks = mapBlocks(row.blocks);
  }
  if (options.includeChildren && row.children) {
    node.children = row.children.map((child) => mapDocumentationNode(child, options));
  }
  return node;
}

// Хлебные крошки = предки узла сверху вниз (без самого узла). Дерево ограничено
// тремя уровнями, поэтому достаточно цепочки parent → parent.parent.
export function documentationBreadcrumbs(row: DocumentationArticleRow): DocumentationBreadcrumb[] {
  const ancestors: DocumentationBreadcrumb[] = [];
  const parent = row.parent;
  if (parent) {
    if (parent.parent) {
      ancestors.push({ id: parent.parent.id, slug: parent.parent.slug, title: parent.parent.title });
    }
    ancestors.push({ id: parent.id, slug: parent.slug, title: parent.title });
  }
  return ancestors;
}

export function mapDocumentationDetail(row: DocumentationArticleRow): DocumentationDetail {
  return {
    ...mapDocumentationNode(row, { includeBlocks: true }),
    blocks: mapBlocks(row.blocks),
    breadcrumbs: documentationBreadcrumbs(row),
  };
}
