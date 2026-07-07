import { describe, expect, it } from "vitest";
import type { DocumentationNode } from "@ecoplatform/shared";
import {
  buildDocumentationBreadcrumbs,
  buildDocumentationIndexCodes,
  documentationNodeContainsSlug,
  extractDocumentationToc,
  findDocumentationNeighbors,
  findDocumentationPath,
} from "./documentation-utils";

function docNode(slug: string, overrides: Partial<DocumentationNode> = {}): DocumentationNode {
  return {
    id: slug,
    slug,
    title: slug,
    subtitle: null,
    iconType: null,
    displayIcon: null,
    parentId: null,
    position: 0,
    status: "published",
    isPinned: false,
    version: null,
    effectiveDate: null,
    firstPublishedAt: null,
    revisedAt: null,
    file: null,
    ...overrides,
  };
}

describe("documentation tree helpers", () => {
  const tree = [
    docNode("dogovory", {
      title: "Договоры",
      iconType: "category",
      children: [
        docNode("postavka", {
          title: "Поставка",
          iconType: "category",
          children: [docNode("postavka-vtorsyrya", { title: "Поставка вторсырья" })],
        }),
      ],
    }),
    docNode("reglamenty", { title: "Регламенты", iconType: "category" }),
  ];

  it("находит путь до вложенного документа", () => {
    expect(findDocumentationPath(tree, "postavka-vtorsyrya")?.map((node) => node.slug)).toEqual([
      "dogovory",
      "postavka",
      "postavka-vtorsyrya",
    ]);
  });

  it("строит хлебные крошки без текущего документа", () => {
    expect(buildDocumentationBreadcrumbs(tree, docNode("postavka-vtorsyrya"))).toEqual([
      { title: "Договоры", slug: "dogovory" },
      { title: "Поставка", slug: "postavka" },
    ]);
  });

  it("проверяет, содержит ли ветка активный slug", () => {
    expect(documentationNodeContainsSlug(tree[0]!, "postavka-vtorsyrya")).toBe(true);
    expect(documentationNodeContainsSlug(tree[1]!, "postavka-vtorsyrya")).toBe(false);
    expect(documentationNodeContainsSlug(tree[0]!, undefined)).toBe(false);
  });
});

describe("buildDocumentationIndexCodes", () => {
  it("нумерует разделы и документы реестровыми кодами 01 / 01.02 / 01.02.01", () => {
    const tree = [
      docNode("dogovory", {
        children: [docNode("postavka"), docNode("uslugi", { children: [docNode("hranenie")] })],
      }),
      docNode("reglamenty"),
    ];

    const codes = buildDocumentationIndexCodes(tree);
    expect(codes.get("dogovory")).toBe("01");
    expect(codes.get("postavka")).toBe("01.01");
    expect(codes.get("uslugi")).toBe("01.02");
    expect(codes.get("hranenie")).toBe("01.02.01");
    expect(codes.get("reglamenty")).toBe("02");
  });
});

describe("findDocumentationNeighbors", () => {
  const tree = [
    docNode("dogovory", {
      children: [docNode("postavka"), docNode("agentskiy"), docNode("hranenie")],
    }),
    docNode("reglamenty"),
  ];

  it("находит соседей среди документов одного раздела", () => {
    const { prev, next } = findDocumentationNeighbors(tree, "agentskiy");
    expect(prev?.slug).toBe("postavka");
    expect(next?.slug).toBe("hranenie");
  });

  it("у первого документа нет prev, у последнего нет next", () => {
    expect(findDocumentationNeighbors(tree, "postavka").prev).toBeNull();
    expect(findDocumentationNeighbors(tree, "hranenie").next).toBeNull();
  });

  it("для корневых разделов соседи — другие корневые разделы", () => {
    const { prev, next } = findDocumentationNeighbors(tree, "dogovory");
    expect(prev).toBeNull();
    expect(next?.slug).toBe("reglamenty");
  });

  it("для неизвестного slug возвращает пустых соседей", () => {
    expect(findDocumentationNeighbors(tree, "unknown")).toEqual({ prev: null, next: null });
    expect(findDocumentationNeighbors(tree, undefined)).toEqual({ prev: null, next: null });
  });
});

describe("extractDocumentationToc", () => {
  it("собирает оглавление из heading/subheading, пропуская пустые и прочие блоки", () => {
    const blocks = [
      { id: "b1", position: 0, type: "paragraph", payload: { html: "<p>Вступление</p>" } },
      { id: "b2", position: 1, type: "heading", payload: { text: "Порядок применения" } },
      { id: "b3", position: 2, type: "subheading", payload: { text: "Сроки" } },
      { id: "b4", position: 3, type: "heading", payload: { text: "   " } },
      { id: "b5", position: 4, type: "image", payload: { fileId: "f1" } },
    ];

    expect(extractDocumentationToc(blocks)).toEqual([
      { blockIndex: 1, text: "Порядок применения", level: 2 },
      { blockIndex: 2, text: "Сроки", level: 3 },
    ]);
  });

  it("для пустых блоков возвращает пустое оглавление", () => {
    expect(extractDocumentationToc(undefined)).toEqual([]);
    expect(extractDocumentationToc([])).toEqual([]);
  });
});
