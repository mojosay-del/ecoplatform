import { KNOWLEDGE_CATEGORY_ICON_TYPE } from "./constants";
import type { Article } from "./types";

export function isKnowledgeCategory(article: Article) {
  return article.iconType === KNOWLEDGE_CATEGORY_ICON_TYPE;
}

export function sortByPosition(a: Article, b: Article) {
  return a.position - b.position;
}
