import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  icon,
  children,
  footer,
  width = "w-[480px]",
}: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const drawer = (
    <div
      className={`fixed inset-0 z-50 transition-all duration-300 ${
        open ? "visible" : "invisible pointer-events-none"
      }`}
    >
      <div
        className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`dialog-card absolute right-0 top-0 h-full ${width} flex flex-col border-l border-white/[0.08] bg-surface-1 shadow-2xl shadow-black/40 transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="shrink-0 flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-2.5">
            {icon && (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/20 to-teal-500/10">
                {icon}
              </div>
            )}
            <h2 className="text-base font-semibold text-neutral-200">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t border-white/[0.06] px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(drawer, document.body);
}
