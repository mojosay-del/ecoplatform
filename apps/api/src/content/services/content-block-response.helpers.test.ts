import { describe, expect, it } from "vitest";
import { sanitizeContentBlockForResponse, sanitizeContentBlocksForResponse } from "./content-block-response.helpers";

describe("content block response sanitizer", () => {
  it("sanitizes paragraph HTML without mutating the source block", () => {
    const source = {
      id: "block-1",
      type: "paragraph",
      payload: {
        v: 1,
        html: '<p onclick="alert(1)">Текст</p><script>alert(1)</script><a href="javascript:alert(1)" target="_blank">bad</a>',
      },
    };

    const clean = sanitizeContentBlockForResponse(source);

    expect(clean).not.toBe(source);
    expect(clean.payload).not.toBe(source.payload);
    expect(clean.payload).toEqual({
      v: 1,
      html: '<p>Текст</p><a target="_blank" rel="noopener noreferrer">bad</a>',
    });
    expect(source.payload.html).toContain("onclick");
  });

  it("keeps allowed formatting and link hardening from the shared sanitizer", () => {
    const [clean] = sanitizeContentBlocksForResponse([
      {
        type: "paragraph",
        payload: {
          html: '<p style="text-indent:1.5em;position:fixed;color:#123456">Абзац</p><a href="https://example.com" target="_blank" rel="opener nofollow">ok</a>',
        },
      },
    ]);

    expect(clean?.payload).toEqual({
      html: '<p style="text-indent: 1.5em; color: #123456">Абзац</p><a href="https://example.com" target="_blank" rel="nofollow noopener noreferrer">ok</a>',
    });
  });

  it("leaves non-paragraph blocks as the same objects", () => {
    const source = { type: "heading", payload: { text: "Заголовок" } };

    expect(sanitizeContentBlockForResponse(source)).toBe(source);
    expect(sanitizeContentBlocksForResponse([source])).toEqual([source]);
  });
});
