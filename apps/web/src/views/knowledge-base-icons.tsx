"use client";

import {
  Archive,
  Box,
  Boxes,
  CircleDot,
  Factory,
  FileText,
  Layers,
  Leaf,
  Newspaper,
  Package,
  PackageOpen,
  Recycle,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { KnowledgeBaseDisplayIconName } from "@ecoplatform/shared";
import { isKnowledgeBaseDisplayIconName } from "@ecoplatform/shared";

type KnowledgeIconNode = {
  slug?: string;
  title: string;
  displayIcon?: string | null;
};

export type KnowledgeIconOption = {
  name: KnowledgeBaseDisplayIconName;
  label: string;
  Icon: LucideIcon;
};

export const KNOWLEDGE_ICON_OPTIONS: KnowledgeIconOption[] = [
  { name: "Newspaper", label: "Макулатура", Icon: Newspaper },
  { name: "Layers", label: "Плёнки", Icon: Layers },
  { name: "Package", label: "Упаковка", Icon: Package },
  { name: "PackageOpen", label: "Тара", Icon: PackageOpen },
  { name: "Archive", label: "Архив", Icon: Archive },
  { name: "Recycle", label: "Переработка", Icon: Recycle },
  { name: "Leaf", label: "Экология", Icon: Leaf },
  { name: "Factory", label: "Производство", Icon: Factory },
  { name: "Boxes", label: "Партии", Icon: Boxes },
  { name: "Box", label: "Короб", Icon: Box },
  { name: "Tags", label: "Марки", Icon: Tags },
  { name: "FileText", label: "Документ", Icon: FileText },
  { name: "CircleDot", label: "Нейтральная", Icon: CircleDot },
];

const knowledgeIconByName = KNOWLEDGE_ICON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.name] = option.Icon;
    return acc;
  },
  {} as Record<KnowledgeBaseDisplayIconName, LucideIcon>,
);

const KNOWLEDGE_ICON_DEFAULT: KnowledgeBaseDisplayIconName = "CircleDot";

export function knowledgeDisplayIconNameForNode(node: KnowledgeIconNode, depth: number): KnowledgeBaseDisplayIconName {
  if (isKnowledgeBaseDisplayIconName(node.displayIcon)) {
    return node.displayIcon;
  }

  const slug = (node.slug ?? "").toLowerCase();
  const title = node.title.toLowerCase();

  if (depth === 0) {
    if (slug.includes("makulatura") || title.includes("макулат")) return "Newspaper";
    if (slug.includes("plenk") || title.includes("плен")) return "Layers";
    if (slug.includes("plast") || title.includes("пласт")) return "Package";
    return "Recycle";
  }

  if (slug.includes("arhiv") || title.includes("архив")) return "Archive";
  if (slug.includes("pet") || title.includes("пэт")) return "Recycle";
  if (slug.includes("plenk") || title.includes("плен") || title.includes("стрейч")) return "Layers";
  if (slug.includes("karton") || slug.includes("gofro") || title.includes("картон")) return "Package";
  return KNOWLEDGE_ICON_DEFAULT;
}

export function knowledgeDisplayIconForNode(node: KnowledgeIconNode, depth: number): LucideIcon {
  return knowledgeIconByName[knowledgeDisplayIconNameForNode(node, depth)];
}

export function knowledgeDisplayIconByName(name: string | null | undefined): LucideIcon {
  if (isKnowledgeBaseDisplayIconName(name)) {
    return knowledgeIconByName[name];
  }
  return knowledgeIconByName[KNOWLEDGE_ICON_DEFAULT];
}

export function defaultKnowledgeDisplayIconName(kind: "category" | "material"): KnowledgeBaseDisplayIconName {
  return kind === "category" ? "Recycle" : KNOWLEDGE_ICON_DEFAULT;
}
