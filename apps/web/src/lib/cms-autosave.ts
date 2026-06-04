"use client";

import { useCallback, useEffect, useRef, useState, type FocusEvent } from "react";

export const CMS_AUTOSAVE_INTERVAL_MS = 30_000;

export type CmsAutosaveState = "saved" | "dirty" | "saving" | "error";

export function getCmsAutosaveLabel(state: CmsAutosaveState): string {
  switch (state) {
    case "saving":
      return "Сохраняется…";
    case "error":
      return "Не сохранено";
    case "dirty":
      return "Не сохранено";
    case "saved":
      return "Сохранено";
  }
}

export function canAutosaveDraft(
  status: "draft" | "published" | null | undefined,
  id: string | null | undefined,
): boolean {
  return Boolean(id && status === "draft");
}

export function shouldRunCmsAutosave(input: { enabled: boolean; hasChanges: boolean; isSaving: boolean }): boolean {
  return input.enabled && input.hasChanges && !input.isSaving;
}

// Предупреждаем перед закрытием вкладки/переходом, если есть несохранённые
// правки — браузер покажет нативный диалог «Покинуть страницу?». Это последняя
// страховка от потери работы (автосейв срабатывает не мгновенно).
export function useUnsavedChangesWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
}

export function useCmsAutosave({
  enabled,
  hasChanges,
  onSave,
  intervalMs = CMS_AUTOSAVE_INTERVAL_MS,
}: {
  enabled: boolean;
  hasChanges: boolean;
  onSave: () => Promise<unknown>;
  intervalMs?: number;
}) {
  const [state, setState] = useState<CmsAutosaveState>(hasChanges ? "dirty" : "saved");
  const enabledRef = useRef(enabled);
  const hasChangesRef = useRef(hasChanges);
  const isSavingRef = useRef(false);
  const onSaveRef = useRef(onSave);

  enabledRef.current = enabled;
  hasChangesRef.current = hasChanges;
  onSaveRef.current = onSave;

  useEffect(() => {
    if (!hasChanges) {
      setState("saved");
      return;
    }
    if (state !== "saving" && state !== "error") {
      setState("dirty");
    }
  }, [hasChanges, state]);

  const runAutosave = useCallback(async () => {
    if (
      !shouldRunCmsAutosave({
        enabled: enabledRef.current,
        hasChanges: hasChangesRef.current,
        isSaving: isSavingRef.current,
      })
    ) {
      return false;
    }

    isSavingRef.current = true;
    setState("saving");
    try {
      await onSaveRef.current();
      setState("saved");
      return true;
    } catch {
      setState("error");
      return false;
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const intervalId = window.setInterval(() => {
      void runAutosave();
    }, intervalMs);
    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs, runAutosave]);

  useEffect(() => {
    if (!enabled) return;
    function handleWindowBlur() {
      void runAutosave();
    }
    window.addEventListener("blur", handleWindowBlur);
    return () => window.removeEventListener("blur", handleWindowBlur);
  }, [enabled, runAutosave]);

  const handleBlur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      const nextFocusedNode = event.relatedTarget;
      if (nextFocusedNode instanceof Node && event.currentTarget.contains(nextFocusedNode)) {
        return;
      }
      void runAutosave();
    },
    [runAutosave],
  );

  return {
    autosaveState: state,
    autosaveLabel: getCmsAutosaveLabel(state),
    handleAutosaveBlur: handleBlur,
    isAutosaving: state === "saving",
    runAutosave,
  };
}
