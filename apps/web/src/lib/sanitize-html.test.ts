import { describe, expect, it } from "vitest";
import { sanitizeParagraphHtml } from "./sanitize-html";

describe("web sanitize html", () => {
  it("removes unsafe tags, handlers, and javascript urls", () => {
    expect(
      sanitizeParagraphHtml(
        '<p onclick="alert(1)">Текст</p><script>alert(1)</script><a href="javascript:alert(1)" target="_blank">bad</a>',
      ),
    ).toBe('<p>Текст</p><a target="_blank" rel="noopener noreferrer">bad</a>');
  });

  it("keeps allowed formatting, safe styles, and safe links", () => {
    expect(
      sanitizeParagraphHtml(
        '<p style="text-indent:1.5em;position:fixed;color:#123456">Абзац&nbsp;</p><a href="https://example.com" target="_blank" rel="opener nofollow">ok</a>',
      ),
    ).toBe(
      '<p style="text-indent: 1.5em; color: #123456">Абзац&nbsp;</p><a href="https://example.com" target="_blank" rel="nofollow noopener noreferrer">ok</a>',
    );
  });
});
