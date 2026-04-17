import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { AppLayout } from "./components/layout/AppLayout";
import { DashboardView } from "./components/dashboard/DashboardView";
import { SettingsView } from "./components/dashboard/SettingsView";
import { StatsView } from "./components/dashboard/StatsView";
import { PromptsView } from "./components/dashboard/PromptsView";
import { SessionsView } from "./components/dashboard/SessionsView";
import { SpotlightPanel } from "./components/spotlight/SpotlightPanel";
import { ProxyView } from "./components/dashboard/ProxyView";
import { AddAccountDialog } from "./components/accounts/AddAccountDialog";
import { ErrorBoundary } from "./components/ui/ErrorBoundary";
import { useUIStore } from "./stores/uiStore";
import { useAccountStore } from "./stores/accountStore";
import { useGlobalShortcut } from "./hooks/useGlobalShortcut";
import { ToastContainer } from "./components/ui/Toast";
import { toast } from "./stores/toastStore";
import { getAccounts, getActiveAccountId, refreshTrayMenu } from "./lib/tauri";

const isSpotlight = new URLSearchParams(window.location.search).has("spotlight");

export function App() {
  useGlobalShortcut();

  if (isSpotlight) {
    return (
      <ErrorBoundary fallbackTitle="浮窗出错">
        <SpotlightPanel />
      </ErrorBoundary>
    );
  }
  const currentView = useUIStore((s) => s.currentView);
  const addAccountDialogOpen = useUIStore((s) => s.addAccountDialogOpen);
  const addAccountDialogInitialTab = useUIStore((s) => s.addAccountDialogInitialTab);
  const setAddAccountDialogOpen = useUIStore((s) => s.setAddAccountDialogOpen);
  const settingsDrawerOpen = useUIStore((s) => s.settingsDrawerOpen);
  const setSettingsDrawerOpen = useUIStore((s) => s.setSettingsDrawerOpen);
  const setAccounts = useAccountStore((s) => s.setAccounts);
  const setActiveAccountId = useAccountStore((s) => s.setActiveAccountId);

  useEffect(() => {
    const unlisten = listen<string>("menu-navigate", (event) => {
      const view = event.payload;
      const valid = ["dashboard", "settings", "stats", "prompts", "sessions", "proxy"];
      if (valid.includes(view)) {
        useUIStore.getState().setCurrentView(view as "dashboard" | "settings" | "stats" | "prompts" | "sessions" | "proxy");
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  useEffect(() => {
    const views = ["dashboard", "proxy", "prompts", "stats", "sessions"] as const;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= views.length) {
        e.preventDefault();
        useUIStore.getState().setCurrentView(views[num - 1]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    getAccounts()
      .then((accounts) => {
        if (Array.isArray(accounts) && accounts.length > 0) {
          setAccounts(accounts);
          getActiveAccountId()
            .then((id) => { if (id) setActiveAccountId(id); })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, [setAccounts, setActiveAccountId]);

  useEffect(() => {
    const unlisten = listen<string>("tray-account-switched", (event) => {
      const accountId = event.payload;
      setActiveAccountId(accountId);
      const { accounts } = useAccountStore.getState();
      const name = accounts.find((a) => a.id === accountId)?.name ?? accountId;
      toast("success", `已切换到 ${name}`);
      refreshTrayMenu().catch(() => {});
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [setActiveAccountId]);

  return (
    <AppLayout>
      <div key={currentView} className="page-transition">
        <ErrorBoundary fallbackTitle="账号管理页面出错">
          {currentView === "dashboard" && <DashboardView />}
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="统计页面出错">
          {currentView === "stats" && <StatsView />}
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="模板页面出错">
          {currentView === "prompts" && <PromptsView />}
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="历史页面出错">
          {currentView === "sessions" && <SessionsView />}
        </ErrorBoundary>
        <ErrorBoundary fallbackTitle="代理页面出错">
          {currentView === "proxy" && <ProxyView />}
        </ErrorBoundary>
      </div>
      <AddAccountDialog
        open={addAccountDialogOpen}
        onClose={() => setAddAccountDialogOpen(false)}
        initialTab={addAccountDialogInitialTab}
      />
      <ErrorBoundary fallbackTitle="设置页面出错">
        <SettingsView
          open={settingsDrawerOpen}
          onClose={() => setSettingsDrawerOpen(false)}
        />
      </ErrorBoundary>
      <ToastContainer />
    </AppLayout>
  );
}
