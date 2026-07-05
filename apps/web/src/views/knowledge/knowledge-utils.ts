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
