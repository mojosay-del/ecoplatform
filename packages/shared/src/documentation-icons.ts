export const documentationDisplayIconNames = [
  "FileText",
  "Scale",
  "Gavel",
  "ShieldCheck",
  "ClipboardCheck",
  "ScrollText",
  "BookOpen",
  "Landmark",
  "BadgeCheck",
  "FileSignature",
  "FileCheck2",
  "FilePenLine",
  "Files",
  "Archive",
  "FolderOpen",
  "Stamp",
  "ShieldAlert",
  "ClipboardList",
  "BookMarked",
  "CircleDot",
] as const;

export type DocumentationDisplayIconName = (typeof documentationDisplayIconNames)[number];

const documentationDisplayIconNameSet = new Set<string>(documentationDisplayIconNames);

export function isDocumentationDisplayIconName(value: unknown): value is DocumentationDisplayIconName {
  return typeof value === "string" && documentationDisplayIconNameSet.has(value);
}
