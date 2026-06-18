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
