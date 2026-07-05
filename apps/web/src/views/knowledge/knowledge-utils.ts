import type { KnowledgeNode } from "@ecoplatform/shared";

export const DEFAULT_KNOWLEDGE_ROOT_SLUG = "makulatura";

export function findPreferredKnowledgeNode(nodes: KnowledgeNode[]): KnowledgeNode | null {
  return (
    nodes.find((node) => node.slug === DEFAULT_KNOWLEDGE_ROOT_SLUG) ?? nodes[0] ?? findFirstReadableKnowledgeNode(nodes)
  );
}

export function countKnowledgeNodes(nodes: KnowledgeNode[]): number {
  return nodes.reduce((count, node) => count + 1 + countKnowledgeNodes(node.children ?? []), 0);
}

export function findFirstReadableKnowledgeNode(nodes: KnowledgeNode[]): KnowledgeNode | null {
  for (const node of nodes) {
    if ((node.blocks ?? []).length > 0 || (node.children ?? []).length === 0) {
      return node;
    }
    const child = findFirstReadableKnowledgeNode(node.children ?? []);
    if (child) return child;
  }
  return null;
}

export function knowledgeNodeContainsSlug(node: KnowledgeNode, slug?: string): boolean {
  if (!slug) return false;
  if (node.slug === slug) return true;
  return (node.children ?? []).some((child) => knowledgeNodeContainsSlug(child, slug));
}

export function buildKnowledgeBreadcrumbs(
  nodes: KnowledgeNode[],
  active: Pick<KnowledgeNode, "slug">,
): Array<{ title: string; slug: string }> {
  const path = findKnowledgePath(nodes, active.slug) ?? [];
  return path.slice(0, -1).map((node) => ({ title: node.title, slug: node.slug }));
}

export function findKnowledgePath(nodes: KnowledgeNode[], slug?: string): KnowledgeNode[] | null {
  if (!slug) return null;
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const childPath = findKnowledgePath(node.children ?? [], slug);
    if (childPath) return [node, ...childPath];
  }
  return null;
}

/* --- Архивный каталог: индексные коды, соседи, оглавление, время чтения, фолбэк-обложки. --- */

export function buildKnowledgeIndexCodes(nodes: KnowledgeNode[], prefix = ""): Map<string, string> {
  const codes = new Map<string, string>();
  nodes.forEach((node, index) => {
    const code = `${prefix}${prefix ? "." : ""}${String(index + 1).padStart(2, "0")}`;
    codes.set(node.slug, code);
    for (const [childSlug, childCode] of buildKnowledgeIndexCodes(node.children ?? [], code)) {
      codes.set(childSlug, childCode);
    }
  });
  return codes;
}

export type KnowledgeNeighbors = {
  prev: KnowledgeNode | null;
  next: KnowledgeNode | null;
};

export function findKnowledgeNeighbors(nodes: KnowledgeNode[], slug?: string): KnowledgeNeighbors {
  const path = findKnowledgePath(nodes, slug);
  if (!path || path.length === 0) return { prev: null, next: null };
  const siblings = path.length === 1 ? nodes : (path[path.length - 2]?.children ?? []);
  const index = siblings.findIndex((node) => node.slug === slug);
  if (index === -1) return { prev: null, next: null };
  return { prev: siblings[index - 1] ?? null, next: siblings[index + 1] ?? null };
}

export type KnowledgeTocEntry = {
  blockIndex: number;
  text: string;
  level: 2 | 3;
};

export function extractKnowledgeToc(blocks: KnowledgeNode["blocks"]): KnowledgeTocEntry[] {
  return (blocks ?? []).flatMap((block, blockIndex) => {
    if (block.type !== "heading" && block.type !== "subheading") return [];
    const text = typeof block.payload?.text === "string" ? block.payload.text.trim() : "";
    if (!text) return [];
    return [{ blockIndex, text, level: block.type === "heading" ? 2 : 3 } satisfies KnowledgeTocEntry];
  });
}

// Та же эвристика скорости чтения, что и у длительности уроков на бэке
// (learning-duration.helpers): ≈180 слов в минуту.
const READING_WORDS_PER_MINUTE = 180;

export function estimateKnowledgeReadingMinutes(blocks: KnowledgeNode["blocks"]): number {
  const text = (blocks ?? [])
    .map((block) => {
      if (block.type === "paragraph" && typeof block.payload?.html === "string") {
        return block.payload.html.replace(/<[^>]*>/g, " ");
      }
      if (typeof block.payload?.text === "string") return block.payload.text;
      return "";
    })
    .join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) return 0;
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE));
}

export const KNOWLEDGE_FALLBACK_COVER_VARIANTS = 6;

// Детерминированный вариант «архивной» обложки-фолбэка: обложки могут отсутствовать
// (или быть недоступны, как в dev), поэтому вариант выбирается стабильно из slug (FNV-1a).
export function knowledgeFallbackCoverVariant(slug: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return Math.abs(hash) % KNOWLEDGE_FALLBACK_COVER_VARIANTS;
}
