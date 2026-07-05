"use client";

import {
  Anvil,
  Barrel,
  BatteryFull,
  Blocks,
  Box,
  BottleWine,
  BrickWall,
  Cable,
  CircuitBoard,
  Container,
  CupSoda,
  Cylinder,
  Disc3,
  Droplet,
  FlaskConical,
  Layers,
  LeafyGreen,
  Microchip,
  Newspaper,
  Package,
  PackageOpen,
  Recycle,
  Shirt,
  Tags,
  TreePine,
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
  { name: "Box", label: "Картон / короб", Icon: Box },
  { name: "Layers", label: "Плёнки", Icon: Layers },
  { name: "Blocks", label: "Пластики", Icon: Blocks },
  { name: "CupSoda", label: "ПЭТ-тара", Icon: CupSoda },
  { name: "Package", label: "Упаковка", Icon: Package },
  { name: "PackageOpen", label: "Тара", Icon: PackageOpen },
  { name: "Container", label: "Контейнеры", Icon: Container },
  { name: "BottleWine", label: "Стекло / бутылки", Icon: BottleWine },
  { name: "Anvil", label: "Металл", Icon: Anvil },
  { name: "Cylinder", label: "Алюминий / банки", Icon: Cylinder },
  { name: "TreePine", label: "Дерево", Icon: TreePine },
  { name: "Shirt", label: "Текстиль", Icon: Shirt },
  { name: "Disc3", label: "Резина / шины", Icon: Disc3 },
  { name: "Cable", label: "Кабель", Icon: Cable },
  { name: "CircuitBoard", label: "Электроника", Icon: CircuitBoard },
  { name: "Microchip", label: "Микросхемы", Icon: Microchip },
  { name: "BatteryFull", label: "Батареи", Icon: BatteryFull },
  { name: "BrickWall", label: "Стройматериалы", Icon: BrickWall },
  { name: "Barrel", label: "Бочки / масла", Icon: Barrel },
  { name: "FlaskConical", label: "Химсырьё", Icon: FlaskConical },
  { name: "Droplet", label: "Жидкости", Icon: Droplet },
  { name: "LeafyGreen", label: "Органика", Icon: LeafyGreen },
  { name: "Recycle", label: "Вторсырьё", Icon: Recycle },
  { name: "CircleDot", label: "Смешанное сырьё", Icon: Recycle },
];

const LEGACY_KNOWLEDGE_ICON_OPTIONS: KnowledgeIconOption[] = [
  { name: "Archive", label: "Архивная макулатура", Icon: Newspaper },
  { name: "Leaf", label: "Органика", Icon: LeafyGreen },
  { name: "Factory", label: "Промсырьё", Icon: Anvil },
  { name: "Boxes", label: "Партии сырья", Icon: PackageOpen },
  { name: "Tags", label: "Марки сырья", Icon: Tags },
  { name: "FileText", label: "Номенклатура", Icon: Newspaper },
];

const ALL_KNOWLEDGE_ICON_OPTIONS = [...KNOWLEDGE_ICON_OPTIONS, ...LEGACY_KNOWLEDGE_ICON_OPTIONS];

const knowledgeIconByName = ALL_KNOWLEDGE_ICON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.name] = option.Icon;
    return acc;
  },
  {} as Record<KnowledgeBaseDisplayIconName, LucideIcon>,
);

const knowledgeIconOptionByName = ALL_KNOWLEDGE_ICON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.name] = option;
    return acc;
  },
  {} as Record<KnowledgeBaseDisplayIconName, KnowledgeIconOption>,
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
    if (slug.includes("plenk") || title.includes("плен") || title.includes("плён")) return "Layers";
    if (slug.includes("plast") || title.includes("пласт")) return "Blocks";
    if (slug.includes("stekl") || title.includes("стекл")) return "BottleWine";
    if (slug.includes("metall") || title.includes("металл")) return "Anvil";
    if (slug.includes("derev") || title.includes("дерев")) return "TreePine";
    if (slug.includes("organ") || title.includes("орган")) return "LeafyGreen";
    return "Recycle";
  }

  if (slug.includes("arhiv") || title.includes("архив")) return "Newspaper";
  if (slug.includes("karton") || slug.includes("gofro") || title.includes("картон")) return "Box";
  if (slug.includes("bumag") || title.includes("бумаг")) return "Newspaper";
  if (slug.includes("pet") || title.includes("пэт") || title.includes("бутыл")) return "CupSoda";
  if (slug.includes("stekl") || title.includes("стекл")) return "BottleWine";
  if (slug.includes("alumin") || title.includes("алюмин") || title.includes("банк")) return "Cylinder";
  if (slug.includes("metall") || title.includes("металл") || title.includes("лом")) return "Anvil";
  if (slug.includes("derev") || title.includes("дерев")) return "TreePine";
  if (slug.includes("tekstil") || title.includes("текстил") || title.includes("ткан")) return "Shirt";
  if (slug.includes("rezin") || title.includes("резин") || title.includes("шин")) return "Disc3";
  if (slug.includes("kabel") || title.includes("кабел")) return "Cable";
  if (slug.includes("elektr") || title.includes("электр")) return "CircuitBoard";
  if (slug.includes("batar") || title.includes("батар") || title.includes("аккум")) return "BatteryFull";
  if (slug.includes("stroy") || title.includes("стро") || title.includes("кирп")) return "BrickWall";
  if (slug.includes("him") || title.includes("хим")) return "FlaskConical";
  if (slug.includes("masl") || title.includes("масл") || title.includes("нефт")) return "Barrel";
  if (slug.includes("organ") || title.includes("орган")) return "LeafyGreen";
  if (slug.includes("plenk") || title.includes("плен") || title.includes("плён") || title.includes("стрейч")) {
    return "Layers";
  }
  if (slug.includes("plast") || title.includes("пласт")) return "Blocks";
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

export function knowledgeDisplayIconOptionByName(name: string | null | undefined): KnowledgeIconOption {
  if (isKnowledgeBaseDisplayIconName(name)) {
    return knowledgeIconOptionByName[name];
  }
  return knowledgeIconOptionByName[KNOWLEDGE_ICON_DEFAULT];
}

export function defaultKnowledgeDisplayIconName(kind: "category" | "material"): KnowledgeBaseDisplayIconName {
  return kind === "category" ? "Recycle" : KNOWLEDGE_ICON_DEFAULT;
}
