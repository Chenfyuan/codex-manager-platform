import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onConfirm, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="dialog-card relative w-full max-w-sm animate-in fade-in zoom-in-95 rounded-2xl border border-white/[0.08] bg-surface-1 p-6 shadow-2xl shadow-black/40">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            isDanger ? "bg-rose-500/15" : "bg-primary-500/15"
          }`}>
            <AlertTriangle size={18} className={isDanger ? "text-rose-400" : "text-primary-400"} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-neutral-200">{title}</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{message}</p>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
          <span className="text-[10px] text-neutral-500">Enter 确认 · Esc 关闭</span>
          <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-1.5 text-xs font-medium text-white transition-colors ${
              isDanger
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-primary-600 hover:bg-primary-500"
            }`}
          >
            {confirmLabel}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
