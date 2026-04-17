import { useToastStore } from "@/stores/toastStore";
import { X, CheckCircle2, AlertCircle, Info } from "lucide-react";

const icons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const colors = {
  success: "border-emerald-400/40 bg-emerald-500/15 text-emerald-300",
  error: "border-rose-400/40 bg-rose-500/15 text-rose-300",
  info: "border-primary-400/40 bg-primary-500/15 text-primary-300",
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icons[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur-sm animate-in slide-in-from-bottom-2 ${colors[t.type]}`}
          >
            <Icon size={16} className="shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => removeToast(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
