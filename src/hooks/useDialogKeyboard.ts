import { useEffect } from "react";

export function useDialogKeyboard({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit?: () => void;
}) {
  useEffect(() => {
    if (!open) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose, onSubmit]);
}
