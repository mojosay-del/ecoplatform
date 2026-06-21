import { describe, expect, it } from "vitest";
import { normalizeLinkHref, resolveLinkPromptResult } from "./document-editor-commands";

describe("document editor link commands", () => {
  it("добавляет https:// к адресу без схемы", () => {
    expect(normalizeLinkHref("example.com/path")).toBe("https://example.com/path");
  });

  it("сохраняет разрешённые схемы ссылок", () => {
    expect(normalizeLinkHref("https://ecoplatform.pro")).toBe("https://ecoplatform.pro");
    expect(normalizeLinkHref("mailto:hello@example.com")).toBe("mailto:hello@example.com");
    expect(normalizeLinkHref("tel:+79990000000")).toBe("tel:+79990000000");
    expect(normalizeLinkHref("ftp://files.example.com")).toBe("ftp://files.example.com");
  });

  it("различает отмену, очистку и установку ссылки", () => {
    expect(resolveLinkPromptResult(null)).toEqual({ kind: "cancel" });
    expect(resolveLinkPromptResult("   ")).toEqual({ kind: "unset" });
    expect(resolveLinkPromptResult(" ecoplatform.pro ")).toEqual({
      kind: "set",
      href: "https://ecoplatform.pro",
      text: "ecoplatform.pro",
    });
  });
});
