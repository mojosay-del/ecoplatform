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
  "BottleWine",
  "CupSoda",
  "Anvil",
  "Cylinder",
  "TreePine",
  "Shirt",
  "Cable",
  "CircuitBoard",
  "BatteryFull",
  "BrickWall",
  "Barrel",
  "FlaskConical",
  "Droplet",
  "LeafyGreen",
  "Container",
  "Disc3",
  "Blocks",
  "Microchip",
] as const;

export type KnowledgeBaseDisplayIconName = (typeof knowledgeBaseDisplayIconNames)[number];

const knowledgeBaseDisplayIconNameSet = new Set<string>(knowledgeBaseDisplayIconNames);

export function isKnowledgeBaseDisplayIconName(value: unknown): value is KnowledgeBaseDisplayIconName {
  return typeof value === "string" && knowledgeBaseDisplayIconNameSet.has(value);
}
