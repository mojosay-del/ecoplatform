import { describe, expect, it } from "vitest";
import { sanitizeParagraphHtml } from "../src/sanitize-html";

describe("paragraph HTML sanitizer", () => {
  it("keeps editor text styles and removes unsafe CSS declarations", () => {
    const clean = sanitizeParagraphHtml(
      '<span style="position:fixed;top:0;color:#4d73d8;font-size:18px;background-image:url(javascript:alert(1))">Текст</span>',
    );

    expect(clean).toBe('<span style="color: #4d73d8; font-size: 18px">Текст</span>');
  });

  it("removes style attributes when no CMS editor style is allowed", () => {
    const clean = sanitizeParagraphHtml('<span style="width:9999px;position:fixed">Текст</span>');

    expect(clean).toBe("<span>Текст</span>");
  });

  it("keeps link hardening while stripping unsafe hrefs", () => {
    expect(sanitizeParagraphHtml('<a href="https://example.com" target="_blank">ok</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
    );
    expect(sanitizeParagraphHtml('<a href="javascript:alert(1)" target="_blank">bad</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">bad</a>',
    );
  });
});
