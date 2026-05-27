import { describe, expect, it } from "vitest";
import { canAutosaveDraft, getCmsAutosaveLabel, shouldRunCmsAutosave } from "./cms-autosave";

describe("CMS autosave helpers", () => {
  it("uses the three visible editor states from the audit requirement", () => {
    expect(getCmsAutosaveLabel("saved")).toBe("Сохранено");
    expect(getCmsAutosaveLabel("saving")).toBe("Сохраняется…");
    expect(getCmsAutosaveLabel("error")).toBe("Не сохранено");
    expect(getCmsAutosaveLabel("dirty")).toBe("Не сохранено");
  });

  it("autosaves only existing draft entities", () => {
    expect(canAutosaveDraft("draft", "news-id")).toBe(true);
    expect(canAutosaveDraft("draft", null)).toBe(false);
    expect(canAutosaveDraft("published", "news-id")).toBe(false);
  });

  it("skips autosave when there are no changes or a save is already running", () => {
    expect(shouldRunCmsAutosave({ enabled: true, hasChanges: true, isSaving: false })).toBe(true);
    expect(shouldRunCmsAutosave({ enabled: true, hasChanges: false, isSaving: false })).toBe(false);
    expect(shouldRunCmsAutosave({ enabled: true, hasChanges: true, isSaving: true })).toBe(false);
    expect(shouldRunCmsAutosave({ enabled: false, hasChanges: true, isSaving: false })).toBe(false);
  });
});
