"use client";

import {
  Archive,
  BadgeCheck,
  BookMarked,
  BookOpen,
  CircleDot,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FilePenLine,
  FileSignature,
  FileText,
  Files,
  FolderOpen,
  Gavel,
  Landmark,
  Scale,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  type LucideIcon,
} from "lucide-react";
import type { DocumentationDisplayIconName } from "@ecoplatform/shared";
import { isDocumentationDisplayIconName } from "@ecoplatform/shared";

export type DocumentationIconNode = {
  title: string;
  slug?: string | null;
  displayIcon?: string | null;
};

export type DocumentationIconOption = {
  name: DocumentationDisplayIconName;
  label: string;
  Icon: LucideIcon;
};

export const DOCUMENTATION_ICON_OPTIONS: DocumentationIconOption[] = [
  { name: "FileText", label: "Документация", Icon: FileText },
  { name: "Scale", label: "Право / закон", Icon: Scale },
  { name: "Gavel", label: "Правовые споры", Icon: Gavel },
  { name: "ShieldCheck", label: "Контроль / безопасность", Icon: ShieldCheck },
  { name: "ClipboardCheck", label: "Регламенты", Icon: ClipboardCheck },
  { name: "ScrollText", label: "Нормативные акты", Icon: ScrollText },
  { name: "BookOpen", label: "Методики", Icon: BookOpen },
  { name: "Landmark", label: "Госорганы", Icon: Landmark },
  { name: "BadgeCheck", label: "Сертификаты", Icon: BadgeCheck },
  { name: "FileSignature", label: "Договоры", Icon: FileSignature },
  { name: "FileCheck2", label: "Разрешения", Icon: FileCheck2 },
  { name: "FilePenLine", label: "Заявления / формы", Icon: FilePenLine },
  { name: "Files", label: "Реестры", Icon: Files },
  { name: "Archive", label: "Архив", Icon: Archive },
  { name: "FolderOpen", label: "Папка документов", Icon: FolderOpen },
  { name: "Stamp", label: "Печати / шаблоны", Icon: Stamp },
  { name: "ShieldAlert", label: "Риски / требования", Icon: ShieldAlert },
  { name: "ClipboardList", label: "Отчётность", Icon: ClipboardList },
  { name: "BookMarked", label: "Справочники", Icon: BookMarked },
  { name: "CircleDot", label: "Общий раздел", Icon: CircleDot },
];

const documentationIconByName = DOCUMENTATION_ICON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.name] = option.Icon;
    return acc;
  },
  {} as Record<DocumentationDisplayIconName, LucideIcon>,
);

const documentationIconOptionByName = DOCUMENTATION_ICON_OPTIONS.reduce(
  (acc, option) => {
    acc[option.name] = option;
    return acc;
  },
  {} as Record<DocumentationDisplayIconName, DocumentationIconOption>,
);

const DOCUMENTATION_ICON_DEFAULT: DocumentationDisplayIconName = "FileText";

export function documentationDisplayIconNameForNode(node: DocumentationIconNode): DocumentationDisplayIconName {
  if (isDocumentationDisplayIconName(node.displayIcon)) {
    return node.displayIcon;
  }

  const title = node.title.toLowerCase();
  const slug = (node.slug ?? "").toLowerCase();
  const haystack = `${slug} ${title}`;

  if (haystack.includes("договор") || haystack.includes("контракт")) return "FileSignature";
  if (haystack.includes("закон") || haystack.includes("прав") || haystack.includes("фз")) return "Scale";
  if (haystack.includes("суд") || haystack.includes("спор") || haystack.includes("претенз")) return "Gavel";
  if (haystack.includes("регламент") || haystack.includes("порядок") || haystack.includes("инструкц")) {
    return "ClipboardCheck";
  }
  if (haystack.includes("приказ") || haystack.includes("постанов") || haystack.includes("норматив")) {
    return "ScrollText";
  }
  if (haystack.includes("сертифик") || haystack.includes("декларац") || haystack.includes("соответств")) {
    return "BadgeCheck";
  }
  if (haystack.includes("лиценз") || haystack.includes("разреш")) return "FileCheck2";
  if (haystack.includes("гос") || haystack.includes("ведом") || haystack.includes("росприрод")) return "Landmark";
  if (haystack.includes("архив")) return "Archive";
  if (haystack.includes("отч")) return "ClipboardList";
  if (haystack.includes("метод")) return "BookOpen";
  if (haystack.includes("справ")) return "BookMarked";
  if (haystack.includes("реестр") || haystack.includes("переч")) return "Files";
  if (haystack.includes("форма") || haystack.includes("заявлен")) return "FilePenLine";
  if (haystack.includes("шаблон") || haystack.includes("печать")) return "Stamp";
  if (haystack.includes("риск") || haystack.includes("требован")) return "ShieldAlert";
  if (haystack.includes("контрол") || haystack.includes("безопас")) return "ShieldCheck";

  return DOCUMENTATION_ICON_DEFAULT;
}

export function documentationDisplayIconForNode(node: DocumentationIconNode): LucideIcon {
  return documentationIconByName[documentationDisplayIconNameForNode(node)];
}

export function documentationDisplayIconOptionByName(name: string | null | undefined): DocumentationIconOption {
  if (isDocumentationDisplayIconName(name)) {
    return documentationIconOptionByName[name];
  }
  return documentationIconOptionByName[DOCUMENTATION_ICON_DEFAULT];
}

export function defaultDocumentationDisplayIconName(): DocumentationDisplayIconName {
  return DOCUMENTATION_ICON_DEFAULT;
}
