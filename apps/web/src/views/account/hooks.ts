import { useEffect, type RefObject } from "react";

export function useAccountDialogBodyLock(isOpen: boolean, onClose: () => void, closeDisabled = false) {
  useEffect(() => {
    if (!isOpen) return;

    document.body.classList.add("account-password-modal-open");

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabled) {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("account-password-modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeDisabled, isOpen, onClose]);
}

export function useAccountDialogFocusTrap(containerRef: RefObject<HTMLElement | null>, closeDisabled: boolean) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const trapContainer = container;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusFirst = () => {
      const first = trapContainer.querySelector<HTMLElement>(focusableSelector);
      first?.focus();
    };

    const frame = window.requestAnimationFrame(focusFirst);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const focusable = Array.from(trapContainer.querySelectorAll<HTMLElement>(focusableSelector)).filter(
        (element) => element.offsetParent !== null,
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
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
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      if (closeDisabled && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
  }, [closeDisabled, containerRef]);
}
