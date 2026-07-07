import type { DocumentationNode } from "@ecoplatform/shared";

// Утилиты «Реестра документов»: индексные коды разделов, путь/соседи по дереву и
// оглавление из блоков описания. DTO не меняем — всё считаем на клиенте из tree.

export function documentationNodeContainsSlug(node: DocumentationNode, slug?: string): boolean {
  if (!slug) return false;
  if (node.slug === slug) return true;
  return (node.children ?? []).some((child) => documentationNodeContainsSlug(child, slug));
}

export function findDocumentationPath(nodes: DocumentationNode[], slug?: string): DocumentationNode[] | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const childPath = findDocumentationPath(node.children ?? [], slug);
    if (childPath) return [node, ...childPath];
  }
  return null;
}

export function buildDocumentationBreadcrumbs(
  nodes: DocumentationNode[],
  active: Pick<DocumentationNode, "slug">,
): Array<{ title: string; slug: string }> {
  const path = findDocumentationPath(nodes, active.slug) ?? [];
  return path.slice(0, -1).map((node) => ({ title: node.title, slug: node.slug }));
}

// Реестровые коды: разделы и документы нумеруются 01 / 01.02 / 01.02.01.
export function buildDocumentationIndexCodes(nodes: DocumentationNode[], prefix = ""): Map<string, string> {
  const codes = new Map<string, string>();
  nodes.forEach((node, index) => {
    const code = `${prefix}${prefix ? "." : ""}${String(index + 1).padStart(2, "0")}`;
    codes.set(node.slug, code);
    for (const [childSlug, childCode] of buildDocumentationIndexCodes(node.children ?? [], code)) {
      codes.set(childSlug, childCode);
    }
  });
  return codes;
}

export type DocumentationNeighbors = {
  prev: DocumentationNode | null;
  next: DocumentationNode | null;
};

// Соседи в том же разделе — для навигации «предыдущий / следующий документ».
export function findDocumentationNeighbors(nodes: DocumentationNode[], slug?: string): DocumentationNeighbors {
  const path = findDocumentationPath(nodes, slug);
  if (!path || path.length === 0) return { prev: null, next: null };
  const siblings = path.length === 1 ? nodes : (path[path.length - 2]?.children ?? []);
  const index = siblings.findIndex((node) => node.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return { prev: siblings[index - 1] ?? null, next: siblings[index + 1] ?? null };
}

export type DocumentationTocEntry = {
  blockIndex: number;
  text: string;
  level: 2 | 3;
};

// Оглавление описания документа из heading/subheading-блоков (для страницы «Дело»).
export function extractDocumentationToc(blocks: DocumentationNode["blocks"]): DocumentationTocEntry[] {
  return (blocks ?? []).flatMap((block, blockIndex) => {
    if (block.type !== "heading" && block.type !== "subheading") return [];
    const text = typeof block.payload?.text === "string" ? block.payload.text.trim() : "";
    if (!text) return [];
    return [{ blockIndex, text, level: block.type === "heading" ? 2 : 3 } satisfies DocumentationTocEntry];
  });
}
