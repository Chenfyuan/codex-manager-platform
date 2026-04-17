import { useState, useEffect, useCallback, useRef } from "react";
import { Zap, Crown, Loader2, Maximize2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import {
  getAccounts,
  getActiveAccountId,
  activateAccount,
  checkAllQuotas,
  toggleSpotlight,
} from "@/lib/tauri";
import type { Account, QuotaInfo } from "@/lib/types";
import { useThemeStore } from "@/stores/themeStore";

const planLabels: Record<string, string> = {
  pro: "Pro",
  plus: "Plus",
  prolite: "Pro Lite",
  business: "Business",
  free: "Free",
  unknown: "—",
};

const EXIT_DURATION = 150;

export function SpotlightPanel() {
  useThemeStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quotas, setQuotas] = useState<Record<string, QuotaInfo>>({});
  const [switching, setSwitching] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(true);
  const closingRef = useRef(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ theme: string; resolved: string }>("theme-changed", (event) => {
      const { theme, resolved } = event.payload;
      const root = document.documentElement;
      root.classList.remove("dark", "light");
      root.classList.add(resolved);
      useThemeStore.setState({
        theme: theme as "dark" | "light" | "system",
        resolvedTheme: resolved as "dark" | "light",
      });
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [accts, active] = await Promise.all([
        getAccounts(),
        getActiveAccountId(),
      ]);
      setAccounts(accts);
      setActiveId(active);
      setLoaded(true);

      const results = await checkAllQuotas();
      const q: Record<string, QuotaInfo> = {};
      for (const [id, quota] of results) q[id] = quota;
      setQuotas(q);
    } catch {}
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    win
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          closingRef.current = false;
          setExiting(false);
          setVisible(true);
          loadData();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, [loadData]);

  const hidePanel = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setExiting(true);
    setTimeout(() => {
      toggleSpotlight().catch(() => {
        getCurrentWindow().hide().catch(() => {});
      });
    }, EXIT_DURATION);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") hidePanel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hidePanel]);

  const handleSwitch = async (id: string) => {
    if (id === activeId || switching) return;
    setSwitching(id);
    try {
      await activateAccount(id);
      setActiveId(id);
    } catch {}
    setSwitching(null);
  };

  const filtered = accounts;

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden spotlight-bg ${
        exiting ? "spotlight-exit" : visible ? "spotlight-enter" : ""
      }`}
    >
      <div
        data-tauri-drag-region
        className="titlebar-drag flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-4 py-3"
      >
        <Zap size={14} className="text-primary-400" />
        <span className="flex-1 text-xs font-medium text-neutral-300">
          Codex 快捷面板
        </span>
        <button
          onClick={hidePanel}
          className="titlebar-no-drag rounded-md p-0.5 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
        >
          <Maximize2 size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {!loaded ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={18} className="animate-spin text-neutral-500" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-xs text-neutral-500">
            暂无账号
          </p>
        ) : (
          <div className="space-y-1.5">
            {filtered.map((a) => {
              const isActive = a.id === activeId;
              const q = quotas[a.id];
              const remaining =
                q?.primaryUsedPercent != null
                  ? 100 - q.primaryUsedPercent
                  : null;
              const plan = q?.planType ?? "unknown";
              const isSwitching = switching === a.id;

              return (
                <button
                  key={a.id}
                  onClick={() => handleSwitch(a.id)}
                  disabled={isActive || !!switching}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? "bg-primary-500/[0.12] border border-primary-400/30"
                      : "border border-transparent hover:bg-white/[0.06]"
                  } ${isSwitching ? "opacity-60" : ""}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-neutral-200">
                        {a.name}
                      </span>
                      {isActive && (
                        <span className="flex shrink-0 items-center gap-0.5 rounded-full bg-primary-500/20 px-1.5 py-px text-[9px] font-bold text-primary-300">
                          <Zap size={8} />
                          当前
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                      <span className="flex items-center gap-0.5">
                        <Crown size={9} />
                        {planLabels[plan] ?? plan}
                      </span>
                      {a.modelPreference && (
                        <span className="text-sky-400/70">
                          {a.modelPreference}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {remaining != null ? (
                      <>
                        <span
                          className={`text-xs font-semibold tabular-nums ${
                            remaining <= 10
                              ? "text-rose-400"
                              : remaining <= 30
                                ? "text-amber-400"
                                : "text-primary-300"
                          }`}
                        >
                          {Math.round(remaining)}%
                        </span>
                        <div className="h-1 w-16 rounded-full bg-white/[0.08]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              remaining <= 10
                                ? "bg-rose-500"
                                : remaining <= 30
                                  ? "bg-amber-500"
                                  : "bg-primary-500"
                            }`}
                            style={{ width: `${remaining}%` }}
                          />
                        </div>
                      </>
                    ) : (
                      <span className="text-[10px] text-neutral-600">—</span>
                    )}
                  </div>

                  {isSwitching && (
                    <Loader2
                      size={14}
                      className="shrink-0 animate-spin text-primary-400"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
