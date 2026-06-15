// Известные типы блоков из shared/content-blocks. Используем минимальные
// shape-типы вместо BaseContentBlock — здесь только то, что реально рендерим.
export type RenderableBlock =
  | { type: "heading" | "subheading"; payload: { text: string } }
  | { type: "paragraph"; payload: { html: string } }
  | { type: "image"; payload: { fileId: string; caption?: string; altText?: string } }
  | { type: "gallery"; payload: { images: Array<{ fileId: string; caption?: string; altText?: string }> } }
  | { type: "video"; payload: { fileId?: string; caption?: string } }
  | { type: "audio"; payload: { fileId: string; episodeTitle?: string; caption?: string; durationSeconds?: number } }
  | { type: "file"; payload: { fileId: string; displayName: string; description?: string } }
  | { type: "checklist"; payload: { title: string; style: string; items: string[] } }
  | {
      type: "image_checklist";
      payload: {
        title: string;
        style: string;
        image: { fileId: string; caption?: string; altText?: string };
        items: string[];
      };
    }
  | { type: string; payload: Record<string, unknown> };

export type ContentBlocksVariant = "default" | "knowledge";

export type ChecklistPayload = { title: string; style: string; items: string[] };
