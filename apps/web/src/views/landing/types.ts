import type { LucideIcon } from "lucide-react";

export type IndexCard = {
  name: string;
  code: string;
  price: string;
  unit: string;
  change: string;
  up: boolean;
  series: number[];
};

export type NewsTile = {
  title: string;
  lead: string;
  date: string;
  tags: string[];
  photo: string;
};

export type EducationCard = {
  title: string;
  lessons: number;
  progress: number;
  photo: string;
};

export type DocumentationTile = {
  title: string;
  subtitle: string;
  format: "DOCX" | "PDF" | "XLSX";
  meta: string;
  status: "new" | "updated";
};

export type ForumTile = {
  title: string;
  excerpt: string;
  status: "solved" | "open";
  rawMaterial: string;
  questionType: string;
  answers: number;
  views: number;
};

export type ForumExpert = {
  name: string;
  role: string;
  solved: number;
};

export type ForumProfile = {
  name: string;
  role: string;
  answers: number;
  solved: number;
};

export type KnowledgeNavItem = {
  label: string;
  head?: boolean;
  active?: boolean;
  muted?: boolean;
};

export type WhyCard = {
  icon?: LucideIcon;
  t: string;
  d: string;
  feature?: boolean;
};

export type Metric = {
  count: number;
  suffix: string;
  unit?: string;
  l: string;
};
