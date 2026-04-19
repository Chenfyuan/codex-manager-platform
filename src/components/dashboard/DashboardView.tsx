import { useState, useEffect, useRef } from "react";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { toast } from "@/stores/toastStore";
import { activateAccount, checkAllQuotas, checkQuota, detectCodexCli, removeAccount, refreshOAuthToken, getQuotaHistory, getSetting, getRecommendedAccount, getTodaySwitchCount, getCodexProcesses, getAccountLaunchCommand, logOperation, reorderAccounts } from "@/lib/tauri";
import { notifyTaskComplete, notifyQuotaWarning } from "@/lib/notifications";
import { EditAccountDialog } from "@/components/accounts/EditAccountDialog";
import { reorderAccountIds } from "@/components/dashboard/accountOrder";
import { Sparkline } from "@/components/ui/Sparkline";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Account, CodexProcessInfo } from "@/lib/types";
import {
  Monitor,
  Plus,
  Download,
  Crown,
  RefreshCw,
  Mail,
  Clock,
  Loader2,
  Trash2,
  Pencil,
  MoreHorizontal,
  Zap,
  Tag,
  Users,
  CheckCircle,
  Percent,
  ArrowLeftRight,
  Terminal,
} from "lucide-react";

const planLabels: Record<string, { text: string; color: string }> = {
  pro: { text: "Pro", color: "text-violet-300 bg-violet-500/20 border-violet-400/30" },
  plus: { text: "Plus", color: "text-emerald-300 bg-emerald-500/20 border-emerald-400/30" },
  prolite: { text: "Pro Lite", color: "text-sky-300 bg-sky-500/20 border-sky-400/30" },
  business: { text: "Business", color: "text-amber-300 bg-amber-500/20 border-amber-400/30" },
  free: { text: "Free", color: "text-neutral-400 bg-neutral-500/15 border-neutral-400/25" },
  unknown: { text: "未知", color: "text-neutral-500 bg-neutral-500/10 border-neutral-500/20" },
};

const CODEX_PROCESS_POLL_INTERVAL_MS = 5_000;

function formatResetTime(resetsAt: number): string {
  const diffMins = Math.max(0, Math.round((resetsAt * 1000 - Date.now()) / 60000));
  if (diffMins <= 0) return "已重置";
  if (diffMins > 60) return `${Math.round(diffMins / 60)}h`;
  return `${diffMins}m`;
}

function formatElapsed(secs: number): string {
  if (secs < 60) return `${secs}秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)}分${secs % 60}秒`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}时${m}分`;
}

function QuotaBar({ percent, label, resetsAt }: { percent: number; label: string; resetsAt?: number | null }) {
  const pct = Math.min(100, Math.max(0, percent));
  const remaining = 100 - pct;
  const barBg =
    remaining <= 10
      ? "bg-gradient-to-r from-rose-500 to-red-400"
      : remaining <= 30
        ? "bg-gradient-to-r from-amber-500 to-yellow-400"
        : "bg-gradient-to-r from-primary-500 to-teal-400";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`font-semibold tabular-nums ${remaining <= 10 ? "text-rose-400" : remaining <= 30 ? "text-amber-400" : "text-primary-300"}`}>
            {remaining}%
          </span>
          {resetsAt && (
            <span className="flex items-center gap-0.5 text-neutral-500">
              <Clock size={9} />
              {formatResetTime(resetsAt)}
            </span>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-white/[0.08]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barBg}`}
          style={{ width: `${remaining}%` }}
        />
      </div>
    </div>
  );
}

function CardMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setConfirming(false); }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); setConfirming(false); }}
        className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-[120px] rounded-lg border border-white/[0.08] bg-surface-2 py-1 shadow-xl backdrop-blur-xl">
          <button
            onClick={() => { onEdit(); setOpen(false); }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06]"
          >
            <Pencil size={12} />
            编辑
          </button>
          {confirming ? (
            <button
              onClick={() => { onDelete(); setOpen(false); setConfirming(false); }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-error transition-colors hover:bg-error/10"
            >
              <Trash2 size={12} />
              确认删除
            </button>
          ) : (
            <button
              onClick={() => setConfirming(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-error"
            >
              <Trash2 size={12} />
              删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DashboardView() {
  const accounts = useAccountStore((s) => s.accounts);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const quotas = useAccountStore((s) => s.quotas);
  const tagFilter = useAccountStore((s) => s.tagFilter);
  const setTagFilter = useAccountStore((s) => s.setTagFilter);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);
  const setQuota = useAccountStore((s) => s.setQuota);
  const setQuotaLoading = useAccountStore((s) => s.setQuotaLoading);
  const setAccounts = useAccountStore((s) => s.setAccounts);
  const setAddAccountDialogOpen = useUIStore((s) => s.setAddAccountDialogOpen);
  const [activating, setActivating] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [quotaHistory, setQuotaHistory] = useState<Record<string, number[]>>({});
  const [todaySwitchCount, setTodaySwitchCount] = useState(0);
  const [codexRunning, setCodexRunning] = useState(false);
  const [codexProcesses, setCodexProcesses] = useState<CodexProcessInfo[]>([]);
  const [codexCliAvailable, setCodexCliAvailable] = useState<boolean | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const removeAccountFromStore = useAccountStore((s) => s.removeAccount);

    const handleActivate = async (accountId: string) => {
    setActivating(accountId);
    try {
      await activateAccount(accountId);
      setActiveAccountId(accountId);
      const name = accounts.find((a) => a.id === accountId)?.name ?? accountId;
      toast("success", `已切换到 ${name}${codexRunning ? "（检测到运行中的 Codex 进程，新启动的 Codex 将使用新账号）" : ""}`);
      getTodaySwitchCount().then(setTodaySwitchCount).catch(() => {});
    } catch (e) {
      toast("error", `切换失败: ${e}`);
    } finally {
      setActivating(null);
    }
  };

  const handleCheckSingleQuota = async (accountId: string) => {
    if (codexCliAvailable === false) {
      toast("error", "未检测到 Codex CLI，安装后才能查询额度");
      return;
    }

    setRefreshingId(accountId);
    try {
      const quota = await checkQuota(accountId);
      setQuota(accountId, quota);
      if (quota.error) {
        toast("error", `额度查询出错: ${quota.error}`);
      } else {
        toast("success", "额度已刷新");
      }
    } catch (e) {
      toast("error", `查询额度失败: ${e}`);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (accountId: string) => {
    try {
      await removeAccount(accountId);
      removeAccountFromStore(accountId);
      if (activeAccountId === accountId) {
        setActiveAccountId(null);
      }
      toast("success", "账号已删除");
    } catch (e) {
      toast("error", `删除失败: ${e}`);
    }
  };

  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const processPollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const warnedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    detectCodexCli()
      .then((info) => {
        if (cancelled) return;
        setCodexCliAvailable(info.found);
        if (!info.found) {
          setCodexRunning(false);
          setCodexProcesses([]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setCodexCliAvailable(false);
        setCodexRunning(false);
        setCodexProcesses([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (processPollRef.current) {
      clearInterval(processPollRef.current);
      processPollRef.current = undefined;
    }

    if (accounts.length === 0 || codexCliAvailable !== true) {
      setCodexRunning(false);
      setCodexProcesses([]);
      return;
    }

    let cancelled = false;
    let refreshing = false;

    const refreshCodexProcesses = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const processes = await getCodexProcesses();
        if (cancelled) return;
        setCodexProcesses(processes);
        setCodexRunning(processes.length > 0);
      } catch {
        if (!cancelled) {
          setCodexRunning(false);
          setCodexProcesses([]);
        }
      } finally {
        refreshing = false;
      }
    };

    refreshCodexProcesses();
    processPollRef.current = setInterval(refreshCodexProcesses, CODEX_PROCESS_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (processPollRef.current) {
        clearInterval(processPollRef.current);
        processPollRef.current = undefined;
      }
    };
  }, [accounts.length, codexCliAvailable]);

  useEffect(() => {
    if (accounts.length === 0 || codexCliAvailable !== true) return;

    const startPolling = async () => {
      const intervalSetting = await getSetting("poll_interval").catch(() => null);
      const intervalMs = intervalSetting ? Number(intervalSetting) * 1000 : 5 * 60 * 1000;

      const poll = async () => {
      const state = useAccountStore.getState();
      if (state.quotaLoading) return;
      setQuotaLoading(true);
      try {
        const results = await checkAllQuotas();
        for (const [id, q] of results) setQuota(id, q);

        const historyMap: Record<string, number[]> = {};
        for (const [id] of results) {
          try {
            const h = await getQuotaHistory(id, 24);
            historyMap[id] = h.map(([primary]) => 100 - primary);
          } catch {}
        }
        setQuotaHistory(historyMap);

        getTodaySwitchCount().then(setTodaySwitchCount).catch(() => {});

        // Auto-refresh OAuth tokens on error
        const allAccounts = useAccountStore.getState().accounts;
        for (const [id, q] of results) {
          if (q.error) {
            const acct = allAccounts.find((a) => a.id === id);
            if (acct?.authMethod === "oauth") {
              try {
                await refreshOAuthToken(id);
              } catch {}
            }
          }
        }

        const currentActive = useAccountStore.getState().activeAccountId;
        if (!currentActive) { setQuotaLoading(false); return; }

        const autoSwitchSetting = await getSetting("auto_switch_enabled").catch(() => null);
        if (autoSwitchSetting === "false") { setQuotaLoading(false); return; }

        const thresholdSetting = await getSetting("quota_threshold").catch(() => null);
        const exhaustThreshold = thresholdSetting ? Number(thresholdSetting) : 95;
        const warningThreshold = Math.max(50, exhaustThreshold - 15);

        const notifySetting = await getSetting("notify_enabled").catch(() => null);
        const notifyEnabled = notifySetting !== "false";

        if (notifyEnabled) {
          for (const [id, q] of results) {
            if (q.error || q.primaryUsedPercent == null) continue;
            const remaining = 100 - q.primaryUsedPercent;
            if (q.primaryUsedPercent >= warningThreshold && q.primaryUsedPercent < exhaustThreshold && !warnedRef.current.has(id)) {
              const acct = allAccounts.find((a) => a.id === id);
              notifyQuotaWarning(acct?.name ?? id, Math.round(remaining));
              warnedRef.current.add(id);
            }
            if (q.primaryUsedPercent < warningThreshold) {
              warnedRef.current.delete(id);
            }
          }
        }

        const activeQuota = results.find(([id]) => id === currentActive)?.[1];
        const exhausted = activeQuota?.primaryUsedPercent != null && activeQuota.primaryUsedPercent >= exhaustThreshold;

        const strategySetting = await getSetting("schedule_strategy").catch(() => null);
        const currentStrategy = strategySetting ?? "manual";

        if (currentStrategy === "time_based") {
          const recommended = await getRecommendedAccount("time_based").catch(() => null);
          if (recommended && recommended !== currentActive) {
            await activateAccount(recommended);
            setActiveAccountId(recommended);
            const acct = accounts.find((a) => a.id === recommended);
            notifyTaskComplete("时段调度", `已切换到 ${acct?.name ?? recommended}`);
            logOperation({ action: "switch_account", toAccount: acct?.name ?? recommended, triggerType: "schedule" }).catch(() => {});
          }
        } else if (exhausted && currentStrategy !== "manual") {
          const recommended = await getRecommendedAccount(currentStrategy).catch(() => null);
          if (recommended && recommended !== currentActive) {
            await activateAccount(recommended);
            setActiveAccountId(recommended);
            const acct = accounts.find((a) => a.id === recommended);
            const recQuota = results.find(([id]) => id === recommended)?.[1];
            notifyTaskComplete(
              "自动切换账号",
              `已切换到 ${acct?.name ?? recommended}（剩余 ${100 - (recQuota?.primaryUsedPercent ?? 0)}%）`,
            );
            logOperation({ action: "switch_account", toAccount: acct?.name ?? recommended, triggerType: "auto" }).catch(() => {});
          }
        } else if (exhausted) {
          const best = results
            .filter(([id, q]) => id !== currentActive && !q.error && q.primaryUsedPercent != null && q.primaryUsedPercent < 80)
            .sort((a, b) => (a[1].primaryUsedPercent ?? 100) - (b[1].primaryUsedPercent ?? 100))[0];

          if (best) {
            const [bestId, bestQuota] = best;
            await activateAccount(bestId);
            setActiveAccountId(bestId);
            const bestAccount = accounts.find((a) => a.id === bestId);
            notifyTaskComplete(
              "自动切换账号",
              `已切换到 ${bestAccount?.name ?? bestId}（剩余 ${100 - (bestQuota.primaryUsedPercent ?? 0)}%）`,
            );
            logOperation({ action: "switch_account", toAccount: bestAccount?.name ?? bestId, triggerType: "auto" }).catch(() => {});
          }
        }
      } catch {}
      setQuotaLoading(false);
    };

      poll();
      pollRef.current = setInterval(poll, intervalMs);
    };

    startPolling();
    return () => clearInterval(pollRef.current);
  }, [accounts.length, codexCliAvailable]);

  if (accounts.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-teal-500/10 backdrop-blur-sm">
          <Monitor size={40} className="text-primary-400" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-medium text-neutral-200">
            开始管理你的 Codex 账号
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">
            添加多个 ChatGPT Plus 账号，查看额度剩余，一键切换。额度耗尽时自动切换到有余量的账号。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAddAccountDialogOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary-600/25 transition-all hover:shadow-primary-500/40 hover:brightness-110"
          >
            <Plus size={16} />
            添加 API Key
          </button>
          <button
            onClick={() => {
              useUIStore.setState({ addAccountDialogInitialTab: "import" });
              setAddAccountDialogOpen(true);
            }}
            className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-surface-1 px-5 py-2.5 text-sm text-neutral-300 shadow-sm shadow-black/20 transition-all hover:border-white/[0.12] hover:text-neutral-200"
          >
            <Download size={16} />
            导入已有凭证
          </button>
        </div>
        <div className="mt-4 grid max-w-lg grid-cols-3 gap-3 text-center">
          {[
            { step: "❶", title: "添加账号", desc: "填入 API Key 或 OAuth 登录" },
            { step: "❷", title: "查看额度", desc: "实时查询 5h/7d 使用配额" },
            { step: "❸", title: "一键切换", desc: "耗尽自动切换有余量账号" },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-white/[0.06] bg-surface-1 p-4 shadow-sm shadow-black/20">
              <p className="text-xs font-medium text-primary-400">{item.step} {item.title}</p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-neutral-500">{item.desc}</p>
            </div>
          ))}
        </div>
        <EditAccountDialog account={editingAccount} onClose={() => setEditingAccount(null)} />
      </div>
    );
  }

  const allTags = [...new Set(accounts.map((a) => a.tag).filter((t): t is string => !!t))].sort();

  const filtered = tagFilter
    ? accounts.filter((a) => a.tag === tagFilter)
    : accounts;

  const sorted = filtered;
  const visibleAccountIds = sorted.map((account) => account.id);

  const activeAccount = accounts.find((a) => a.id === activeAccountId);
  const availableCount = accounts.filter((a) => {
    const q = quotas[a.id];
    return !q || !q.primaryUsedPercent || q.primaryUsedPercent < 95;
  }).length;
  const avgRemaining = (() => {
    const withQuota = accounts.filter((a) => quotas[a.id]?.primaryUsedPercent != null);
    if (withQuota.length === 0) return null;
    const sum = withQuota.reduce((s, a) => s + (100 - (quotas[a.id]?.primaryUsedPercent ?? 0)), 0);
    return Math.round(sum / withQuota.length);
  })();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-1 px-3 py-2.5 shadow-sm shadow-black/20">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/15">
            <Users size={15} className="text-primary-400" />
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold tabular-nums text-neutral-200">{accounts.length}</p>
            <p className="truncate text-[10px] text-neutral-500">总账号{activeAccount ? ` · ${activeAccount.name}` : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-1 px-3 py-2.5 shadow-sm shadow-black/20">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <CheckCircle size={15} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums text-neutral-200">{availableCount}<span className="text-xs font-normal text-neutral-500">/{accounts.length}</span></p>
            <p className="text-[10px] text-neutral-500">可用账号</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-1 px-3 py-2.5 shadow-sm shadow-black/20">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/15">
            <Percent size={15} className="text-amber-400" />
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums text-neutral-200">{avgRemaining != null ? `${avgRemaining}%` : "—"}</p>
            <p className="text-[10px] text-neutral-500">平均剩余</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-1 px-3 py-2.5 shadow-sm shadow-black/20">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
            <ArrowLeftRight size={15} className="text-violet-400" />
          </div>
          <div>
            <p className="text-lg font-semibold tabular-nums text-neutral-200">{todaySwitchCount}</p>
            <p className="text-[10px] text-neutral-500">今日切换</p>
          </div>
        </div>
      </div>

      {codexProcesses.length > 0 && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-400">
              Codex 运行中 · {codexProcesses.length} 个进程
            </span>
          </div>
          <div className="space-y-1.5">
            {codexProcesses.map((p) => (
              <div key={p.pid} className="flex items-center gap-3 text-[11px]">
                <span className="font-mono text-neutral-500">PID {p.pid}</span>
                {p.cwd && (
                  <span className="min-w-0 flex-1 truncate text-neutral-400" title={p.cwd}>
                    {p.cwd.replace(/^\/Users\/[^/]+/, "~")}
                  </span>
                )}
                <span className="shrink-0 tabular-nums text-neutral-500">
                  <Clock size={10} className="mr-0.5 inline" />
                  {formatElapsed(p.elapsedSecs)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag size={13} className="text-neutral-500" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setTagFilter(null)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                tagFilter === null
                  ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                  : "border-white/[0.08] text-neutral-500 hover:border-white/[0.15] hover:text-neutral-300"
              }`}
            >
              全部
            </button>
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTagFilter(tagFilter === t ? null : t)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  tagFilter === t
                    ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                    : "border-white/[0.08] text-neutral-500 hover:border-white/[0.15] hover:text-neutral-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {sorted.map((account) => {
          const isActive = activeAccountId === account.id;
          const quota = quotas[account.id];
          const plan = quota?.planType ?? "unknown";
          const planCfg = planLabels[plan] ?? planLabels.unknown;
          const isActivating = activating === account.id;
          const isRefreshing = refreshingId === account.id;
          const isExhausted = quota?.primaryUsedPercent != null && quota.primaryUsedPercent >= 95;

          return (
            <div
              key={account.id}
              draggable
              onDragStart={() => setDragId(account.id)}
              onDragOver={(e) => { e.preventDefault(); setDragOverId(account.id); }}
              onDragLeave={() => setDragOverId(null)}
              onDrop={async () => {
                if (dragId && dragId !== account.id) {
                  const ids = reorderAccountIds({
                    allAccountIds: accounts.map((item) => item.id),
                    visibleAccountIds,
                    draggedId: dragId,
                    targetId: account.id,
                  });
                  const hasChanged = ids.some((id, index) => id !== accounts[index]?.id);
                  if (hasChanged) {
                    const previousAccounts = accounts;
                    const accountMap = new Map(accounts.map((item) => [item.id, item]));
                    const reordered = ids
                      .map((id) => accountMap.get(id))
                      .filter((item): item is Account => Boolean(item));
                    setAccounts(reordered);
                    try {
                      await reorderAccounts(ids);
                    } catch (e) {
                      setAccounts(previousAccounts);
                      toast("error", `排序保存失败: ${e}`);
                    }
                  }
                }
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnd={() => { setDragId(null); setDragOverId(null); }}
              onClick={() => { if (!isActive && !isActivating) handleActivate(account.id); }}
              className={`card-animate group relative rounded-xl border p-4 transition-all duration-300 cursor-grab active:cursor-grabbing ${
                dragOverId === account.id && dragId !== account.id
                  ? "ring-2 ring-primary-400/40 ring-offset-1 ring-offset-transparent"
                  : ""
              } ${dragId === account.id ? "opacity-50" : ""} ${
                isActive
                  ? "animate-pulse-glow border-primary-400/40 bg-gradient-to-br from-primary-500/[0.12] to-primary-600/[0.06] shadow-lg shadow-primary-500/10"
                  : isExhausted
                    ? "border-rose-500/30 bg-gradient-to-br from-rose-500/[0.06] to-rose-600/[0.03] shadow-md shadow-rose-500/5 hover:border-rose-400/40 hover:shadow-lg hover:shadow-rose-500/8"
                    : "border-white/[0.06] bg-surface-1 shadow-sm shadow-black/20 hover:border-white/[0.12] hover:bg-surface-2 hover:shadow-md hover:shadow-black/30"
              } ${isActivating ? "opacity-70 pointer-events-none" : ""}`}
            >
              {isActive && (
                <div className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-primary-500 to-teal-400 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-lg shadow-primary-500/40">
                  <Zap size={9} />
                  当前使用
                </div>
              )}
              {isExhausted && !isActive && (
                <div className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full bg-gradient-to-r from-rose-500 to-pink-500 px-2.5 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-lg shadow-rose-500/40">
                  额度耗尽
                </div>
              )}

              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-neutral-200">{account.name}</h3>
                    <span className={`flex shrink-0 items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-medium ${planCfg.color}`}>
                      <Crown size={8} />
                      {planCfg.text}
                    </span>
                    {account.tag && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-accent-400/25 bg-accent-500/10 px-1.5 py-px text-[10px] font-medium text-accent-400">
                        {account.tag}
                      </span>
                    )}
                    {account.modelPreference && (
                      <span className="flex shrink-0 items-center gap-0.5 rounded-full border border-sky-400/25 bg-sky-500/10 px-1.5 py-px text-[10px] font-medium text-sky-400">
                        {account.modelPreference}
                      </span>
                    )}
                  </div>
                  {quota?.email && (
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-neutral-500/70">
                      <Mail size={10} />
                      {quota.email}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={async () => {
                      try {
                        const cmd = await getAccountLaunchCommand(account.id);
                        await writeText(cmd);
                        toast("success", "启动命令已复制");
                      } catch (e) {
                        toast("error", `复制失败: ${e}`);
                      }
                    }}
                    className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
                    title="复制启动命令"
                  >
                    <Terminal size={13} />
                  </button>
                  <button
                    onClick={() => handleCheckSingleQuota(account.id)}
                    disabled={isRefreshing}
                    className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300 disabled:opacity-50"
                  >
                    {isRefreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  </button>
                  <CardMenu
                    onEdit={() => setEditingAccount(account)}
                    onDelete={() => handleDelete(account.id)}
                  />
                </div>
              </div>

              {quota && !quota.error && quota.primaryUsedPercent != null && (
                <div className="mt-3.5 space-y-2.5">
                  <QuotaBar
                    percent={quota.primaryUsedPercent}
                    label={`${quota.primaryWindowMins ? Math.round(quota.primaryWindowMins / 60) : 5}h 限额`}
                    resetsAt={quota.primaryResetsAt}
                  />
                  {quota.secondaryUsedPercent != null && (
                    <QuotaBar
                      percent={quota.secondaryUsedPercent}
                      label={`${quota.secondaryWindowMins ? Math.round(quota.secondaryWindowMins / 1440) : 7}d 限额`}
                      resetsAt={quota.secondaryResetsAt}
                    />
                  )}
                  {quota.creditsBalance && (
                    <p className="text-[11px] text-neutral-500/70">
                      积分余额 <span className="text-neutral-300">${quota.creditsBalance}</span>
                    </p>
                  )}
                  {quotaHistory[account.id] && quotaHistory[account.id].length >= 2 && (
                    <div className="flex items-center gap-2 pt-1">
                      <Sparkline data={quotaHistory[account.id]} width={80} height={20} />
                      <span className="text-[10px] text-neutral-500/60">趋势</span>
                    </div>
                  )}
                </div>
              )}

              {quota?.error && (
                <p className="mt-3 rounded-md bg-error/[0.06] px-2.5 py-1.5 text-xs text-error/90">{quota.error}</p>
              )}

              {!quota && (
                <p className="mt-3 text-xs text-neutral-600">
                  {codexCliAvailable === false ? "未检测到 Codex CLI，安装后可查询额度" : "点击刷新查看额度"}
                </p>
              )}

              {isActivating && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-primary-400">
                  <Loader2 size={12} className="animate-spin" />
                  切换中...
                </div>
              )}
            </div>
          );
        })}
      </div>
      <EditAccountDialog account={editingAccount} onClose={() => setEditingAccount(null)} />
    </div>
  );
}
