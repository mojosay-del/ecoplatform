import { describe, expect, it } from "vitest";
import { EMPTY_CATEGORY_DRAFT, EMPTY_DOCUMENT_DRAFT } from "./constants";
import {
  buildDocumentationSaveBody,
  buildDraftFromArticle,
  hasDocumentationDraftChanges,
} from "./documentation-draft.helpers";
import type { DocArticle } from "./types";

const baseArticle: DocArticle = {
  id: "doc-1",
  parentId: "cat-1",
  title: "Регламент поставки",
  subtitle: "Короткое описание",
  slug: "reglament-postavki",
  position: 2,
  iconType: null,
  displayIcon: null,
  status: "draft",
  firstPublishedAt: null,
  revisedAt: null,
  isPinned: true,
  version: "1.2",
  effectiveDate: "2026-06-21T00:00:00.000Z",
  file: {
    id: "file-1",
    fileName: "reglament.pdf",
    format: "pdf",
    sizeBytes: 1024,
  },
  blocks: [{ type: "paragraph", payload: { html: "<p>Описание</p>", v: 1 } }],
};

function article(overrides: Partial<DocArticle> = {}): DocArticle {
  return { ...baseArticle, ...overrides };
}

describe("documentation draft helpers", () => {
  it("не считает пустой новый документ изменённым", () => {
    expect(hasDocumentationDraftChanges(EMPTY_DOCUMENT_DRAFT, null)).toBe(false);
  });

  it("считает новый документ с заполненным полем изменённым", () => {
    expect(
      hasDocumentationDraftChanges(
        {
          ...EMPTY_DOCUMENT_DRAFT,
          parentId: "cat-1",
          title: "Новый документ",
        },
        null,
      ),
    ).toBe(true);
  });

  it("собирает черновик существующего документа без ложных изменений canonicalize", () => {
    const draft = buildDraftFromArticle(article());

    expect(draft).toMatchObject({
      kind: "document",
      id: "doc-1",
      parentId: "cat-1",
      title: "Регламент поставки",
      fileAssetId: "file-1",
      version: "1.2",
      effectiveDate: "2026-06-21",
      isPinned: true,
    });
    expect(hasDocumentationDraftChanges(draft, article())).toBe(false);
  });

  it("видит изменения в существующем документе", () => {
    const draft = {
      ...buildDraftFromArticle(article()),
      title: "Обновлённый регламент",
    };

    expect(hasDocumentationDraftChanges(draft, article())).toBe(true);
  });

  it("учитывает displayIcon для категории", () => {
    const category = article({
      id: "cat-1",
      parentId: null,
      iconType: "category",
      displayIcon: "Landmark",
      title: "Правовые документы",
      blocks: [],
      file: null,
      isPinned: false,
      version: null,
      effectiveDate: null,
    });
    const draft = buildDraftFromArticle(category);

    expect(draft).toMatchObject({
      kind: "category",
      displayIcon: "Landmark",
      fileAssetId: "",
      blocks: [],
    });
    expect(hasDocumentationDraftChanges(draft, category)).toBe(false);
    expect(hasDocumentationDraftChanges({ ...draft, displayIcon: EMPTY_CATEGORY_DRAFT.displayIcon }, category)).toBe(
      true,
    );
  });

  it("собирает body категории с trim и null для пустого subtitle", () => {
    expect(
      buildDocumentationSaveBody({
        ...EMPTY_CATEGORY_DRAFT,
        title: "  Договоры  ",
        subtitle: "   ",
        position: 3,
        displayIcon: "FileSignature",
      }),
    ).toEqual({
      parentId: null,
      title: "Договоры",
      subtitle: null,
      iconType: "category",
      displayIcon: "FileSignature",
      position: 3,
      blocks: [],
    });
  });

  it("собирает body документа с прежними null-правилами", () => {
    expect(
      buildDocumentationSaveBody({
        ...EMPTY_DOCUMENT_DRAFT,
        parentId: "cat-1",
        title: "  Шаблон договора  ",
        subtitle: "   ",
        position: 4,
        blocks: [{ type: "paragraph", payload: { html: "<p>Текст</p>" } }],
        fileAssetId: "   ",
        version: " 2.0 ",
        effectiveDate: "2026-06-21",
        isPinned: true,
        markRevised: true,
      }),
    ).toEqual({
      parentId: "cat-1",
      title: "Шаблон договора",
      subtitle: null,
      position: 4,
      displayIcon: null,
      blocks: [{ type: "paragraph", payload: { html: "<p>Текст</p>" } }],
      fileAssetId: null,
      version: "2.0",
      effectiveDate: "2026-06-21T00:00:00.000Z",
      isPinned: true,
      markRevised: true,
    });
  });
});
