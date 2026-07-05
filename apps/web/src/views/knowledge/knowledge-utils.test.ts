import { describe, expect, it } from "vitest";
import type { KnowledgeNode } from "@ecoplatform/shared";
import {
  buildKnowledgeBreadcrumbs,
  buildKnowledgeIndexCodes,
  countKnowledgeNodes,
  estimateKnowledgeReadingMinutes,
  extractKnowledgeToc,
  findKnowledgeNeighbors,
  findKnowledgePath,
  findPreferredKnowledgeNode,
  KNOWLEDGE_FALLBACK_COVER_VARIANTS,
  knowledgeFallbackCoverVariant,
  knowledgeNodeContainsSlug,
} from "./knowledge-utils";

function knowledgeNode(slug: string, overrides: Partial<KnowledgeNode> = {}): KnowledgeNode {
  return {
    id: slug,
    slug,
    title: slug,
    subtitle: null,
    iconType: null,
    displayIcon: null,
    coverImageId: null,
    parentId: null,
    position: 0,
    status: "published",
    ...overrides,
  };
}

describe("findPreferredKnowledgeNode", () => {
  it("выбирает Макулатуру, даже если первый материал внутри дерева — картон", () => {
    const cardboard = knowledgeNode("gofrokarton", {
      title: "Картон",
      blocks: [{ id: "block-1", position: 0, type: "paragraph", payload: {} }],
    });
    const paper = knowledgeNode("makulatura", {
      title: "Макулатура",
      children: [cardboard],
    });

    expect(findPreferredKnowledgeNode([paper])?.slug).toBe("makulatura");
  });

  it("без Макулатуры выбирает первый корневой раздел, а не уходит внутрь дерева", () => {
    const stretch = knowledgeNode("streych-pervichnyy", {
      title: "Стрейч первичный",
      blocks: [{ id: "block-2", position: 0, type: "paragraph", payload: {} }],
    });
    const films = knowledgeNode("plenki", {
      title: "Пленки",
      children: [stretch],
    });

    expect(findPreferredKnowledgeNode([films])?.slug).toBe("plenki");
  });

  it("для пустого дерева возвращает null", () => {
    expect(findPreferredKnowledgeNode([])).toBeNull();
  });
});

describe("countKnowledgeNodes", () => {
  it("считает корневые разделы и вложенные материалы одним общим числом", () => {
    const tree = [
      knowledgeNode("makulatura", {
        children: [
          knowledgeNode("karton"),
          knowledgeNode("bumaga", {
            children: [knowledgeNode("arhiv")],
          }),
        ],
      }),
      knowledgeNode("plastiki", {
        children: [knowledgeNode("pet-butylka")],
      }),
    ];

    expect(countKnowledgeNodes(tree)).toBe(6);
  });
});

describe("knowledge tree helpers", () => {
  const tree = [
    knowledgeNode("makulatura", {
      title: "Макулатура",
      children: [
        knowledgeNode("karton", {
          title: "Картон",
          children: [knowledgeNode("gofrokarton", { title: "Гофрокартон" })],
        }),
      ],
    }),
    knowledgeNode("plastiki", { title: "Пластики" }),
  ];

  it("находит путь до вложенного материала", () => {
    expect(findKnowledgePath(tree, "gofrokarton")?.map((node) => node.slug)).toEqual([
      "makulatura",
      "karton",
      "gofrokarton",
    ]);
  });

  it("строит хлебные крошки без текущего материала", () => {
    expect(buildKnowledgeBreadcrumbs(tree, knowledgeNode("gofrokarton"))).toEqual([
      { title: "Макулатура", slug: "makulatura" },
      { title: "Картон", slug: "karton" },
    ]);
  });

  it("проверяет, содержит ли ветка активный slug", () => {
    expect(knowledgeNodeContainsSlug(tree[0]!, "gofrokarton")).toBe(true);
    expect(knowledgeNodeContainsSlug(tree[1]!, "gofrokarton")).toBe(false);
    expect(knowledgeNodeContainsSlug(tree[0]!, undefined)).toBe(false);
  });
});

describe("buildKnowledgeIndexCodes", () => {
  it("нумерует категории и вложенные материалы архивными кодами 01 / 01.02 / 01.02.01", () => {
    const tree = [
      knowledgeNode("makulatura", {
        children: [knowledgeNode("karton"), knowledgeNode("bumaga", { children: [knowledgeNode("arhiv")] })],
      }),
      knowledgeNode("plenki"),
    ];

    const codes = buildKnowledgeIndexCodes(tree);
    expect(codes.get("makulatura")).toBe("01");
    expect(codes.get("karton")).toBe("01.01");
    expect(codes.get("bumaga")).toBe("01.02");
    expect(codes.get("arhiv")).toBe("01.02.01");
    expect(codes.get("plenki")).toBe("02");
  });
});

describe("findKnowledgeNeighbors", () => {
  const tree = [
    knowledgeNode("makulatura", {
      children: [knowledgeNode("karton"), knowledgeNode("bumaga"), knowledgeNode("arhiv")],
    }),
    knowledgeNode("plenki"),
  ];

  it("находит соседей среди материалов одного родителя", () => {
    const { prev, next } = findKnowledgeNeighbors(tree, "bumaga");
    expect(prev?.slug).toBe("karton");
    expect(next?.slug).toBe("arhiv");
  });

  it("у первого материала нет prev, у последнего нет next", () => {
    expect(findKnowledgeNeighbors(tree, "karton").prev).toBeNull();
    expect(findKnowledgeNeighbors(tree, "arhiv").next).toBeNull();
  });

  it("для корневых разделов соседи — другие корневые разделы", () => {
    const { prev, next } = findKnowledgeNeighbors(tree, "makulatura");
    expect(prev).toBeNull();
    expect(next?.slug).toBe("plenki");
  });

  it("для неизвестного slug возвращает пустых соседей", () => {
    expect(findKnowledgeNeighbors(tree, "unknown")).toEqual({ prev: null, next: null });
    expect(findKnowledgeNeighbors(tree, undefined)).toEqual({ prev: null, next: null });
  });
});

describe("extractKnowledgeToc", () => {
  it("собирает оглавление из heading/subheading, пропуская пустые и прочие блоки", () => {
    const blocks = [
      { id: "b1", position: 0, type: "paragraph", payload: { html: "<p>Вступление</p>" } },
      { id: "b2", position: 1, type: "heading", payload: { text: "Качество" } },
      { id: "b3", position: 2, type: "subheading", payload: { text: "Влажность" } },
      { id: "b4", position: 3, type: "heading", payload: { text: "   " } },
      { id: "b5", position: 4, type: "image", payload: { fileId: "f1" } },
    ];

    expect(extractKnowledgeToc(blocks)).toEqual([
      { blockIndex: 1, text: "Качество", level: 2 },
      { blockIndex: 2, text: "Влажность", level: 3 },
    ]);
  });

  it("для пустых блоков возвращает пустое оглавление", () => {
    expect(extractKnowledgeToc(undefined)).toEqual([]);
    expect(extractKnowledgeToc([])).toEqual([]);
  });
});

describe("estimateKnowledgeReadingMinutes", () => {
  it("считает минуты по словам параграфов (HTML-теги не считаются словами)", () => {
    const words = Array.from({ length: 360 }, (_, index) => `слово${index}`).join(" ");
    const blocks = [{ id: "b1", position: 0, type: "paragraph", payload: { html: `<p>${words}</p>` } }];

    expect(estimateKnowledgeReadingMinutes(blocks)).toBe(2);
  });

  it("короткий текст округляется минимум до 1 минуты, пустой — 0", () => {
    const blocks = [{ id: "b1", position: 0, type: "heading", payload: { text: "Требования" } }];
    expect(estimateKnowledgeReadingMinutes(blocks)).toBe(1);
    expect(estimateKnowledgeReadingMinutes([])).toBe(0);
  });
});

describe("knowledgeFallbackCoverVariant", () => {
  it("детерминирован и укладывается в диапазон вариантов", () => {
    for (const slug of ["makulatura", "plenki", "pet-butylka", "kanistra"]) {
      const variant = knowledgeFallbackCoverVariant(slug);
      expect(variant).toBe(knowledgeFallbackCoverVariant(slug));
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(KNOWLEDGE_FALLBACK_COVER_VARIANTS);
    }
  });
});
