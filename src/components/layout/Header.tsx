import { useState, useEffect } from "react";
import { Settings, Users, BarChart3, FileText, History, Minus, Square, X, Plus, RefreshCw, Loader2, PanelTopOpen, Network, Play } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { platform } from "@tauri-apps/plugin-os";
import { useUIStore, type HeaderAction, type HeaderSegmentGroup } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { checkAllQuotas, toggleSpotlight } from "@/lib/tauri";
import { toast } from "@/stores/toastStore";

export function Header() {
  const currentView = useUIStore((s) => s.currentView);
  const setCurrentView = useUIStore((s) => s.setCurrentView);
  const setAddAccountDialogOpen = useUIStore((s) => s.setAddAccountDialogOpen);
  const settingsDrawerOpen = useUIStore((s) => s.settingsDrawerOpen);
  const setSettingsDrawerOpen = useUIStore((s) => s.setSettingsDrawerOpen);
  const headerSegments = useUIStore((s) => s.headerSegments);
  const headerActions = useUIStore((s) => s.headerActions);
  const accounts = useAccountStore((s) => s.accounts);
  const quotaLoading = useAccountStore((s) => s.quotaLoading);
  const setQuotaLoading = useAccountStore((s) => s.setQuotaLoading);
  const setQuota = useAccountStore((s) => s.setQuota);
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    try {
      setIsMac(platform() === "macos");
    } catch {}
  }, []);

  const handleRefreshAll = async () => {
    setQuotaLoading(true);
    try {
      const results = await checkAllQuotas();
      for (const [id, q] of results) setQuota(id, q);
      toast("success", `已刷新 ${results.length} 个账号额度`);
    } catch (e) {
      toast("error", `查询额度失败: ${e}`);
    } finally {
      setQuotaLoading(false);
    }
  };

  const handleMinimize = () => getCurrentWindow().minimize();
  const handleMaximize = () => getCurrentWindow().toggleMaximize();
  const handleClose = () => getCurrentWindow().close();

  const renderHeaderAction = (action: HeaderAction) => {
    const iconSize = 12;
    const icon =
      action.loading ? (
        <Loader2 size={iconSize} className="animate-spin" />
      ) : action.icon === "refresh" ? (
        <RefreshCw size={iconSize} />
      ) : action.icon === "play" ? (
        <Play size={iconSize} />
      ) : action.icon === "stop" ? (
        <Square size={iconSize} />
      ) : (
        <Plus size={iconSize} />
      );

    const className =
      action.variant === "danger"
        ? "flex items-center gap-1 rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[12px] font-medium text-rose-400 transition-colors hover:bg-rose-500/20 disabled:opacity-50"
        : action.variant === "primary"
          ? "flex items-center gap-1 rounded-md bg-gradient-to-r from-primary-600 to-primary-500 px-2 py-1 text-[12px] font-medium text-white transition-all hover:shadow-md hover:shadow-primary-500/20 hover:brightness-110 disabled:opacity-50"
          : "flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200 disabled:opacity-50";

    return (
      <button
        key={action.id}
        onClick={action.onClick}
        disabled={action.disabled || action.loading}
        className={className}
      >
        {icon}
        {action.label}
      </button>
    );
  };

  const renderHeaderSegmentGroup = (group: HeaderSegmentGroup) => (
    <div
      key={group.id}
      className="flex items-center overflow-hidden rounded-md border border-white/[0.08] bg-surface-2"
    >
      {group.options.map((option) => (
        <button
          key={option.id}
          onClick={option.onClick}
          disabled={option.disabled}
          className={`px-2.5 py-1 text-[12px] transition-colors disabled:opacity-50 ${
            option.active
              ? "bg-primary-600/15 text-primary-400"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <header
      data-tauri-drag-region
      className="titlebar-drag flex h-11 shrink-0 items-center border-b border-white/[0.06] bg-surface-1 backdrop-blur-xl"
    >
      {isMac && <div className="w-[72px] shrink-0" />}

      <nav className="titlebar-no-drag flex items-center gap-2 px-2">
        <button
          onClick={() => setCurrentView("dashboard")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            currentView === "dashboard"
              ? "bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/15"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <Users size={14} />
          账号管理
        </button>
        <button
          onClick={() => setCurrentView("proxy")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            currentView === "proxy"
              ? "bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/15"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <Network size={14} />
          代理
        </button>
        <button
          onClick={() => setCurrentView("prompts")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            currentView === "prompts"
              ? "bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/15"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <FileText size={14} />
          模板
        </button>
        <button
          onClick={() => setCurrentView("stats")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            currentView === "stats"
              ? "bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/15"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <BarChart3 size={14} />
          统计
        </button>
        <button
          onClick={() => setCurrentView("sessions")}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors ${
            currentView === "sessions"
              ? "bg-primary-500/15 text-primary-300 shadow-sm shadow-primary-500/15"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <History size={14} />
          历史
        </button>
      </nav>

      <div className="flex-1" data-tauri-drag-region />

      <div className="titlebar-no-drag flex items-center gap-1 px-2">
        {currentView === "dashboard" && (
          <>
            {accounts.length > 0 && (
              <button
                onClick={handleRefreshAll}
                disabled={quotaLoading}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200 disabled:opacity-50"
              >
                {quotaLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                刷新
              </button>
            )}
            <button
              onClick={() => setAddAccountDialogOpen(true)}
              className="flex items-center gap-1 rounded-md bg-gradient-to-r from-primary-600 to-primary-500 px-2 py-1 text-[12px] font-medium text-white transition-all hover:shadow-md hover:shadow-primary-500/20 hover:brightness-110"
            >
              <Plus size={12} />
              添加
            </button>
          </>
        )}
        {currentView !== "dashboard" &&
          headerSegments.map((group) => renderHeaderSegmentGroup(group))}
        {currentView !== "dashboard" &&
          headerActions.map((action) => renderHeaderAction(action))}
        <div className="mx-0.5 h-4 w-px bg-white/[0.06]" />
        <button
          onClick={() => toggleSpotlight()}
          className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
          title="快捷面板"
        >
          <PanelTopOpen size={15} />
        </button>
        <button
          onClick={() => setSettingsDrawerOpen(!settingsDrawerOpen)}
          title="设置"
          className={`rounded-md p-1.5 transition-colors ${
            settingsDrawerOpen
              ? "bg-primary-500/15 text-primary-300"
              : "text-neutral-400 hover:bg-white/[0.06] hover:text-neutral-200"
          }`}
        >
          <Settings size={15} />
        </button>
      </div>

      {!isMac && (
        <div className="titlebar-no-drag flex h-11 items-center">
          <div className="mx-1 h-4 w-px bg-white/[0.06]" />
          <button
            onClick={handleMinimize}
            className="flex h-11 w-12 items-center justify-center text-neutral-400 transition-colors hover:bg-white/[0.08]"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handleMaximize}
            className="flex h-11 w-12 items-center justify-center text-neutral-400 transition-colors hover:bg-white/[0.08]"
          >
            <Square size={12} />
          </button>
          <button
            onClick={handleClose}
            className="flex h-11 w-12 items-center justify-center text-neutral-400 transition-colors hover:bg-rose-600 hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </header>
  );
}
