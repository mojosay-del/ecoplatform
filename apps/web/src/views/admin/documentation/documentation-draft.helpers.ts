import { canonicalizeBlocks } from "../../../lib/editor/serializer";
import { documentationDisplayIconNameForNode } from "../../documentation-icons";
import { DOC_CATEGORY_ICON_TYPE, EMPTY_CATEGORY_DRAFT, EMPTY_DOCUMENT_DRAFT } from "./constants";
import type { DocArticle, DocDraftKind, DocDraftState } from "./types";
import { dateInputToIso, isDocCategory, isoToDateInput } from "./utils";

export function hasActiveDocumentationDraft(draft: DocDraftState): boolean {
  return draft.id !== null || draft.parentId !== null || draft.kind === "category";
}

export function buildDraftFromArticle(article: DocArticle): DocDraftState {
  const kind: DocDraftKind = isDocCategory(article) ? "category" : "document";

  return {
    ...(kind === "category" ? EMPTY_CATEGORY_DRAFT : EMPTY_DOCUMENT_DRAFT),
    kind,
    id: article.id,
    parentId: kind === "category" ? null : article.parentId,
    title: article.title,
    subtitle: article.subtitle ?? "",
    iconType: kind === "category" ? DOC_CATEGORY_ICON_TYPE : (article.iconType ?? ""),
    displayIcon: kind === "category" ? documentationDisplayIconNameForNode(article) : "",
    position: article.position,
    blocks:
      kind === "category" ? [] : article.blocks.map((block) => ({ type: block.type, payload: { ...block.payload } })),
    fileAssetId: kind === "category" ? "" : (article.file?.id ?? ""),
    version: kind === "category" ? "" : (article.version ?? ""),
    effectiveDate: kind === "category" ? "" : isoToDateInput(article.effectiveDate),
    isPinned: kind === "category" ? false : article.isPinned,
    markRevised: false,
  };
}

export function buildDocumentationSaveBody(draft: DocDraftState) {
  if (draft.kind === "category") {
    return {
      parentId: null,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim() || null,
      iconType: DOC_CATEGORY_ICON_TYPE,
      displayIcon: draft.displayIcon,
      position: draft.position,
      blocks: [],
    };
  }

  return {
    parentId: draft.parentId,
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim() || null,
    position: draft.position,
    displayIcon: null,
    blocks: draft.blocks,
    fileAssetId: draft.fileAssetId.trim() || null,
    version: draft.version.trim() || null,
    effectiveDate: dateInputToIso(draft.effectiveDate),
    isPinned: draft.isPinned,
    markRevised: draft.markRevised,
  };
}

export function hasDocumentationDraftChanges(draft: DocDraftState, original: DocArticle | null): boolean {
  if (!hasActiveDocumentationDraft(draft)) return false;

  if (!draft.id) {
    return (
      draft.title.trim().length > 0 ||
      draft.subtitle.trim().length > 0 ||
      draft.fileAssetId.trim().length > 0 ||
      draft.version.trim().length > 0 ||
      draft.effectiveDate.length > 0 ||
      (draft.kind === "category" && draft.displayIcon !== EMPTY_CATEGORY_DRAFT.displayIcon) ||
      draft.isPinned ||
      draft.blocks.length > 0
    );
  }

  if (!original) return false;

  const originalKind: DocDraftKind = isDocCategory(original) ? "category" : "document";
  if (draft.kind !== originalKind) return true;
  if (draft.title !== original.title) return true;
  if (draft.subtitle !== (original.subtitle ?? "")) return true;
  if (draft.position !== original.position) return true;

  if (draft.kind === "category") {
    return draft.displayIcon !== documentationDisplayIconNameForNode(original);
  }

  if (draft.markRevised) return true;
  if (draft.parentId !== original.parentId) return true;
  if (draft.fileAssetId !== (original.file?.id ?? "")) return true;
  if (draft.version !== (original.version ?? "")) return true;
  if (draft.effectiveDate !== isoToDateInput(original.effectiveDate)) return true;
  if (draft.isPinned !== original.isPinned) return true;

  return (
    JSON.stringify(canonicalizeBlocks(draft.blocks)) !==
    JSON.stringify(canonicalizeBlocks(original.blocks.map((block) => ({ type: block.type, payload: block.payload }))))
  );
}
