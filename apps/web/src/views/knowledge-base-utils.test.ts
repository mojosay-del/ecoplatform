import { describe, expect, it } from "vitest";
import type { KnowledgeNode } from "@ecoplatform/shared";
import { countKnowledgeNodes, findPreferredKnowledgeNode } from "./knowledge-base-utils";

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
