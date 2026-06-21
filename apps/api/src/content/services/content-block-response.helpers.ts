import { sanitizeParagraphHtml } from "../../common/sanitize-html";

type ContentBlockLike = {
  type: string;
  payload: unknown;
};

export function sanitizeContentBlockForResponse<TBlock extends ContentBlockLike>(block: TBlock): TBlock {
  if (block.type !== "paragraph") {
    return block;
  }

  const payload = block.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return block;
  }

  const html = (payload as Record<string, unknown>).html;
  if (typeof html !== "string") {
    return block;
  }

  return {
    ...block,
    payload: {
      ...(payload as Record<string, unknown>),
      html: sanitizeParagraphHtml(html),
    },
  } as TBlock;
}

export function sanitizeContentBlocksForResponse<TBlock extends ContentBlockLike>(blocks: TBlock[]): TBlock[] {
  return blocks.map((block) => sanitizeContentBlockForResponse(block));
}
