export const knowledgeBaseDisplayIconNames = [
  "Newspaper",
  "Layers",
  "Package",
  "PackageOpen",
  "Archive",
  "Recycle",
  "Leaf",
  "Factory",
  "Boxes",
  "Box",
  "Tags",
  "FileText",
  "CircleDot",
] as const;

export type KnowledgeBaseDisplayIconName = (typeof knowledgeBaseDisplayIconNames)[number];

const knowledgeBaseDisplayIconNameSet = new Set<string>(knowledgeBaseDisplayIconNames);

export function isKnowledgeBaseDisplayIconName(value: unknown): value is KnowledgeBaseDisplayIconName {
  return typeof value === "string" && knowledgeBaseDisplayIconNameSet.has(value);
}
