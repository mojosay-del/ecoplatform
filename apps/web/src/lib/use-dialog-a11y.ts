"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DialogA11yOptions = {
  bodyClassName?: string;
  bodyLock?: boolean;
  enabled?: boolean;
  initialFocus?: boolean;
  onEscape?: () => void;
  restoreFocus?: boolean;
};

export function useDialogA11y(
  containerRef: RefObject<HTMLElement | null>,
  {
    bodyClassName,
    bodyLock = false,
    enabled = true,
    initialFocus = true,
    onEscape,
    restoreFocus = true,
  }: DialogA11yOptions = {},
) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const dialog = container;
    const hadTabIndex = dialog.hasAttribute("tabindex");
    const previousTabIndex = dialog.getAttribute("tabindex");
    if (!hadTabIndex) dialog.setAttribute("tabindex", "-1");

    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    if (bodyLock) document.body.style.overflow = "hidden";
    if (bodyClassName) document.body.classList.add(bodyClassName);

    const focusFirst = () => {
      const first = getFocusable(dialog)[0];
      (first ?? dialog).focus();
    };

    const frame = initialFocus ? window.requestAnimationFrame(focusFirst) : null;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && onEscapeRef.current) {
        event.stopPropagation();
        onEscapeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = getFocusable(dialog);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      if (bodyClassName) document.body.classList.remove(bodyClassName);
      if (bodyLock) document.body.style.overflow = previousOverflow;
      if (hadTabIndex) {
        if (previousTabIndex === null) dialog.removeAttribute("tabindex");
        else dialog.setAttribute("tabindex", previousTabIndex);
      } else {
        dialog.removeAttribute("tabindex");
      }
      if (restoreFocus && previousActiveElement?.isConnected) previousActiveElement.focus();
    };
  }, [bodyClassName, bodyLock, containerRef, enabled, initialFocus, restoreFocus]);
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isVisible);
}

function isVisible(element: HTMLElement): boolean {
  return Boolean(element.offsetParent || element.getClientRects().length > 0);
}
