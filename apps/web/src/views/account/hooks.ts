import { useEffect } from "react";

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
