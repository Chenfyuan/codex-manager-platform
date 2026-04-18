import { useEffect, useState } from "react";
import { Sun, Moon, Monitor, Download, Upload, Loader2, Zap, BarChart3, Clock, Trash2, Plus, Key, ScrollText, Settings } from "lucide-react";
import { detectCodexCli, type CodexCliInfo, exportAccounts, importAccountsFromBackup, getSetting, setSetting, getScheduleRules, addScheduleRule, removeScheduleRule, updateAccountPriority, cleanupOldData, getDbSize, getQuotaHistoryCount, getOperationLogs, clearOperationLogs } from "@/lib/tauri";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Drawer } from "@/components/ui/Drawer";
import { useThemeStore } from "@/stores/themeStore";
import { useAccountStore } from "@/stores/accountStore";
import { toast } from "@/stores/toastStore";
import type { ScheduleRule, ScheduleStrategy, OperationLog } from "@/lib/types";

const themeOptions = [
  { value: "light" as const, label: "浅色", icon: Sun },
  { value: "dark" as const, label: "深色", icon: Moon },
  { value: "system" as const, label: "跟随系统", icon: Monitor },
];

export function SettingsView({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [cliInfo, setCliInfo] = useState<CodexCliInfo | null>(null);
  const { theme, setTheme } = useThemeStore();
  const [exportPassword, setExportPassword] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [threshold, setThreshold] = useState(95);
  const [notifyEnabled, setNotifyEnabled] = useState(true);
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(true);
  const [pollInterval, setPollInterval] = useState(300);
  const [autoStartEnabled, setAutoStartEnabled] = useState(false);
  const [strategy, setStrategy] = useState<ScheduleStrategy>("manual");
  const [rules, setRules] = useState<ScheduleRule[]>([]);
  const [dbSize, setDbSize] = useState<number | null>(null);
  const [historyCount, setHistoryCount] = useState<number | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [adminKey, setAdminKey] = useState("");
  const [adminKeySaved, setAdminKeySaved] = useState(false);
  const [opLogs, setOpLogs] = useState<OperationLog[]>([]);
  const [pendingUpdate, setPendingUpdate] = useState<{ version: string; install: () => Promise<void> } | null>(null);
  const accounts = useAccountStore((s) => s.accounts);

  useEffect(() => {
    if (!open) return;
    detectCodexCli().then(setCliInfo).catch(() => {});
    getSetting("openai_admin_key").then((v) => { if (v) { setAdminKey(v); setAdminKeySaved(true); } }).catch(() => {});
    getSetting("quota_threshold").then((v) => { if (v) setThreshold(Number(v)); }).catch(() => {});
    getSetting("notify_enabled").then((v) => { if (v) setNotifyEnabled(v === "true"); }).catch(() => {});
    getSetting("auto_switch_enabled").then((v) => { if (v) setAutoSwitchEnabled(v === "true"); }).catch(() => {});
    getSetting("poll_interval").then((v) => { if (v) setPollInterval(Number(v)); }).catch(() => {});
    getSetting("schedule_strategy").then((v) => { if (v) setStrategy(v as ScheduleStrategy); }).catch(() => {});
    getScheduleRules().then(setRules).catch(() => {});
    import("@tauri-apps/plugin-autostart").then(({ isEnabled }) => {
      isEnabled().then(setAutoStartEnabled).catch(() => {});
    }).catch(() => {});
    getDbSize().then(setDbSize).catch(() => {});
    getQuotaHistoryCount().then(setHistoryCount).catch(() => {});
    getOperationLogs(50).then(setOpLogs).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPendingUpdate(null);
    }
  }, [open]);

  return (
    <>
      <Drawer
        open={open}
        onClose={onClose}
        title="设置"
        icon={<Settings size={15} className="text-primary-400" />}
        width="w-[640px]"
      >
        <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">外观</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 border-l-4 border-l-accent-500/50">
          <p className="mb-3 text-sm font-medium text-neutral-300">主题</p>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                    theme === opt.value
                      ? "border-primary-500 bg-primary-600/10 text-primary-400"
                      : "border-white/[0.08] bg-surface-2 text-neutral-400 hover:border-white/[0.12]"
                  }`}
                >
                  <Icon size={16} />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">通知与自动切换</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-5 border-l-4 border-l-primary-500/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">轮询间隔</p>
              <p className="text-xs text-neutral-500">自动查询所有账号额度的频率</p>
            </div>
            <select
              value={pollInterval}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPollInterval(v);
                setSetting("poll_interval", String(v)).catch(() => {});
              }}
              className="rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-primary-500"
            >
              <option value={60}>1 分钟</option>
              <option value={180}>3 分钟</option>
              <option value={300}>5 分钟</option>
              <option value={600}>10 分钟</option>
              <option value={900}>15 分钟</option>
            </select>
          </div>

          <div className="border-t border-white/[0.06]" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">开机自启</p>
              <p className="text-xs text-neutral-500">系统启动时自动运行，常驻后台管理额度</p>
            </div>
            <button
              onClick={async () => {
                try {
                  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
                  if (autoStartEnabled) {
                    await disable();
                    setAutoStartEnabled(false);
                    toast("success", "已关闭开机自启");
                  } else {
                    await enable();
                    setAutoStartEnabled(true);
                    toast("success", "已开启开机自启");
                  }
                } catch (e) {
                  toast("error", `设置失败: ${e}`);
                }
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${autoStartEnabled ? "bg-gradient-to-r from-primary-500 to-teal-400" : "bg-surface-4"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${autoStartEnabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          <div className="border-t border-white/[0.06]" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-300">额度耗尽阈值</p>
                <p className="text-xs text-neutral-500">当额度使用超过此百分比时触发通知和自动切换</p>
              </div>
              <span className="rounded-md bg-surface-3 px-3 py-1 text-sm font-medium tabular-nums text-neutral-300">
                {threshold}%
              </span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              step={5}
              value={threshold}
              onChange={(e) => {
                const v = Number(e.target.value);
                setThreshold(v);
                setSetting("quota_threshold", String(v)).catch(() => {});
              }}
              className="w-full accent-primary-500"
            />
            <div className="flex justify-between text-[10px] text-neutral-600">
              <span>50%</span>
              <span>75%</span>
              <span>100%</span>
            </div>
          </div>

          <div className="border-t border-white/[0.06]" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">系统通知</p>
              <p className="text-xs text-neutral-500">额度耗尽或自动切换时发送系统通知</p>
            </div>
            <button
              onClick={() => {
                const next = !notifyEnabled;
                setNotifyEnabled(next);
                setSetting("notify_enabled", String(next)).catch(() => {});
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${notifyEnabled ? "bg-gradient-to-r from-primary-500 to-teal-400" : "bg-surface-4"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${notifyEnabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>

          <div className="border-t border-white/[0.06]" />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">自动切换账号</p>
              <p className="text-xs text-neutral-500">额度耗尽时自动切换到有余量的账号</p>
            </div>
            <button
              onClick={() => {
                const next = !autoSwitchEnabled;
                setAutoSwitchEnabled(next);
                setSetting("auto_switch_enabled", String(next)).catch(() => {});
              }}
              className={`relative h-6 w-11 rounded-full transition-colors ${autoSwitchEnabled ? "bg-gradient-to-r from-primary-500 to-teal-400" : "bg-surface-4"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform ${autoSwitchEnabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">智能调度</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-5 border-l-4 border-l-violet-500/50">
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-300">切换策略</p>
            <p className="text-xs text-neutral-500">选择额度耗尽时如何选择下一个账号</p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              {([
                { value: "manual" as const, label: "手动", desc: "不自动切换", icon: Zap },
                { value: "balanced" as const, label: "均衡", desc: "切到剩余最多的", icon: BarChart3 },
                { value: "priority" as const, label: "优先级", desc: "按设定优先级依次耗尽", icon: Zap },
                { value: "time_based" as const, label: "时段", desc: "按时间规则自动切换", icon: Clock },
              ]).map((opt) => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setStrategy(opt.value);
                      setSetting("schedule_strategy", opt.value).catch(() => {});
                    }}
                    className={`flex items-start gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                      strategy === opt.value
                        ? "border-primary-500/40 bg-primary-500/10"
                        : "border-white/[0.08] bg-surface-2 hover:border-white/[0.12]"
                    }`}
                  >
                    <Icon size={14} className={strategy === opt.value ? "text-primary-400 mt-0.5" : "text-neutral-500 mt-0.5"} />
                    <div>
                      <p className={`text-sm font-medium ${strategy === opt.value ? "text-primary-300" : "text-neutral-300"}`}>
                        {opt.label}
                      </p>
                      <p className="text-[11px] text-neutral-500">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {strategy === "priority" && (
            <>
              <div className="border-t border-white/[0.06]" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-neutral-300">账号优先级</p>
                <p className="text-xs text-neutral-500">数值越高越优先使用（耗尽后切到下一个）</p>
                <div className="space-y-2 pt-1">
                  {accounts.map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-2">
                      <span className="text-sm text-neutral-300">{a.name}</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={a.priority}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateAccountPriority(a.id, v).catch(() => {});
                        }}
                        className="w-16 rounded-md border border-white/[0.08] bg-surface-3 px-2 py-1 text-center text-sm tabular-nums text-neutral-200 outline-none focus:border-primary-500"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {strategy === "time_based" && (
            <>
              <div className="border-t border-white/[0.06]" />
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-300">时段规则</p>
                    <p className="text-xs text-neutral-500">在指定时间段自动使用对应账号</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (accounts.length === 0) return;
                      try {
                        const id = await addScheduleRule(accounts[0].id, 9, 18);
                        setRules([...rules, { id, accountId: accounts[0].id, startHour: 9, endHour: 18, days: "0,1,2,3,4,5,6", enabled: true }]);
                      } catch (e) {
                        toast("error", `添加规则失败: ${e}`);
                      }
                    }}
                    className="flex items-center gap-1 rounded-md bg-primary-600/80 px-2 py-1 text-[12px] font-medium text-white transition-colors hover:bg-primary-500"
                  >
                    <Plus size={12} />
                    添加
                  </button>
                </div>
                {rules.length === 0 ? (
                  <p className="py-4 text-center text-xs text-neutral-500">暂无规则，点击添加</p>
                ) : (
                  <div className="space-y-2 pt-1">
                    {rules.map((rule) => (
                      <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-2">
                        <select
                          value={rule.accountId}
                          onChange={async (e) => {
                            const newAccountId = e.target.value;
                            await removeScheduleRule(rule.id).catch(() => {});
                            const newId = await addScheduleRule(newAccountId, rule.startHour, rule.endHour, rule.days);
                            setRules(rules.map((r) => r.id === rule.id ? { ...r, id: newId, accountId: newAccountId } : r));
                          }}
                          className="flex-1 rounded-md border border-white/[0.08] bg-surface-3 px-2 py-1 text-sm text-neutral-200 outline-none"
                        >
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={rule.startHour}
                          onChange={async (e) => {
                            const v = Number(e.target.value);
                            await removeScheduleRule(rule.id).catch(() => {});
                            const newId = await addScheduleRule(rule.accountId, v, rule.endHour, rule.days);
                            setRules(rules.map((r) => r.id === rule.id ? { ...r, id: newId, startHour: v } : r));
                          }}
                          className="w-14 rounded-md border border-white/[0.08] bg-surface-3 px-2 py-1 text-center text-sm tabular-nums text-neutral-200 outline-none"
                        />
                        <span className="text-xs text-neutral-500">至</span>
                        <input
                          type="number"
                          min={0}
                          max={23}
                          value={rule.endHour}
                          onChange={async (e) => {
                            const v = Number(e.target.value);
                            await removeScheduleRule(rule.id).catch(() => {});
                            const newId = await addScheduleRule(rule.accountId, rule.startHour, v, rule.days);
                            setRules(rules.map((r) => r.id === rule.id ? { ...r, id: newId, endHour: v } : r));
                          }}
                          className="w-14 rounded-md border border-white/[0.08] bg-surface-3 px-2 py-1 text-center text-sm tabular-nums text-neutral-200 outline-none"
                        />
                        <span className="text-xs text-neutral-500">点</span>
                        <button
                          onClick={async () => {
                            await removeScheduleRule(rule.id).catch(() => {});
                            setRules(rules.filter((r) => r.id !== rule.id));
                          }}
                          className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-rose-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">费用追踪</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-4 border-l-4 border-l-emerald-500/50">
          <div>
            <p className="text-sm font-medium text-neutral-300">OpenAI Admin Key</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              用于查询 API 费用数据，在 platform.openai.com/settings/organization/admin-keys 创建
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-2">
              <Key size={14} className="shrink-0 text-neutral-500" />
              <input
                type="password"
                value={adminKey}
                onChange={(e) => { setAdminKey(e.target.value); setAdminKeySaved(false); }}
                placeholder="sk-admin-..."
                className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
              />
            </div>
            <button
              disabled={!adminKey.trim() || adminKeySaved}
              onClick={async () => {
                try {
                  await setSetting("openai_admin_key", adminKey.trim());
                  setAdminKeySaved(true);
                  toast("success", "Admin Key 已保存");
                } catch (e) {
                  toast("error", `保存失败: ${e}`);
                }
              }}
              className="shrink-0 rounded-lg bg-primary-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
            >
              {adminKeySaved ? "已保存" : "保存"}
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">备份与恢复</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-4 border-l-4 border-l-amber-500/50">
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-300">导出备份</p>
            <p className="text-xs text-neutral-500">所有账号和凭证将使用密码加密后导出为 JSON 文件</p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="设置加密密码"
                value={exportPassword}
                onChange={(e) => setExportPassword(e.target.value)}
                className="flex-1 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-primary-500"
              />
              <button
                disabled={!exportPassword || exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    const data = await exportAccounts(exportPassword);
                    const { save } = await import("@tauri-apps/plugin-dialog");
                    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
                    const filePath = await save({
                      defaultPath: `codex-backup-${new Date().toISOString().slice(0, 10)}.json`,
                      filters: [{ name: "JSON", extensions: ["json"] }],
                    });
                    if (filePath) {
                      await writeTextFile(filePath, data);
                      toast("success", "备份导出成功");
                      setExportPassword("");
                    }
                  } catch (e) {
                    toast("error", `导出失败: ${e}`);
                  } finally {
                    setExporting(false);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500 disabled:opacity-50"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                导出
              </button>
            </div>
          </div>
          <div className="border-t border-white/[0.06]" />
          <div className="space-y-2">
            <p className="text-sm font-medium text-neutral-300">恢复备份</p>
            <p className="text-xs text-neutral-500">从加密备份文件中恢复账号（不会覆盖现有账号）</p>
            <div className="flex items-center gap-2">
              <input
                type="password"
                placeholder="输入解密密码"
                value={importPassword}
                onChange={(e) => setImportPassword(e.target.value)}
                className="flex-1 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 outline-none focus:border-primary-500"
              />
              <button
                disabled={!importPassword || importing}
                onClick={async () => {
                  try {
                    const { open } = await import("@tauri-apps/plugin-dialog");
                    const { readTextFile } = await import("@tauri-apps/plugin-fs");
                    const filePath = await open({
                      filters: [{ name: "JSON", extensions: ["json"] }],
                      multiple: false,
                    });
                    if (!filePath) return;
                    setImporting(true);
                    const text = await readTextFile(filePath as string);
                    const count = await importAccountsFromBackup(text, importPassword);
                    toast("success", `成功恢复 ${count} 个账号`);
                    setImportPassword("");
                    const { getAccounts } = await import("@/lib/tauri");
                    const accts = await getAccounts();
                    useAccountStore.getState().setAccounts(accts);
                  } catch (err) {
                    toast("error", `恢复失败: ${err}`);
                  } finally {
                    setImporting(false);
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-white/[0.12] hover:text-neutral-200 disabled:opacity-50"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                选择文件
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">数据管理</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-4 border-l-4 border-l-rose-500/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">存储空间</p>
              <p className="text-xs text-neutral-500">
                数据库大小: {dbSize != null ? (dbSize / 1024).toFixed(0) + " KB" : "—"}
                {historyCount != null && <span> · 历史记录: {historyCount} 条</span>}
              </p>
            </div>
            <button
              disabled={cleaning}
              onClick={async () => {
                setCleaning(true);
                try {
                  const deleted = await cleanupOldData(30);
                  toast("success", `已清理 ${deleted} 条旧数据`);
                  getDbSize().then(setDbSize).catch(() => {});
                  getQuotaHistoryCount().then(setHistoryCount).catch(() => {});
                } catch (e) {
                  toast("error", `清理失败: ${e}`);
                } finally {
                  setCleaning(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/[0.12] hover:text-neutral-200 disabled:opacity-50"
            >
              {cleaning ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              清理 30 天前数据
            </button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">操作记录</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-4 border-l-4 border-l-sky-500/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ScrollText size={14} className="text-neutral-400" />
              <span className="text-sm text-neutral-300">
                共 {opLogs.length} 条记录
              </span>
            </div>
            {opLogs.length > 0 && (
              <button
                onClick={async () => {
                  try {
                    const count = await clearOperationLogs();
                    setOpLogs([]);
                    toast("success", `已清除 ${count} 条记录`);
                  } catch (e) {
                    toast("error", `清除失败: ${e}`);
                  }
                }}
                className="flex items-center gap-1 text-xs text-neutral-500 transition-colors hover:text-rose-400"
              >
                <Trash2 size={11} />
                清除全部
              </button>
            )}
          </div>
          {opLogs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <ScrollText size={24} className="text-neutral-600" />
              <p className="text-xs text-neutral-500">暂无操作记录</p>
              <p className="text-[10px] text-neutral-600">切换账号、自动切换等操作将在此记录</p>
            </div>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto">
              {opLogs.map((log) => {
                const actionLabels: Record<string, string> = {
                  switch_account: "切换账号",
                  auto_switch: "自动切换",
                  add_account: "添加账号",
                  remove_account: "删除账号",
                };
                const triggerLabels: Record<string, string> = {
                  manual: "手动",
                  auto: "自动",
                  schedule: "调度",
                  tray: "托盘",
                };
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.02] px-3 py-2 text-xs"
                  >
                    <span className="shrink-0 text-neutral-500">
                      {new Date(log.createdAt).toLocaleString("zh-CN", {
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className="text-neutral-300">
                      {actionLabels[log.action] ?? log.action}
                    </span>
                    {log.toAccount && (
                      <span className="text-primary-400">→ {log.toAccount}</span>
                    )}
                    <div className="flex-1" />
                    <span className="rounded-full border border-white/[0.08] px-1.5 py-px text-[10px] text-neutral-500">
                      {triggerLabels[log.triggerType] ?? log.triggerType}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium text-neutral-200">关于</h2>
        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">
                Codex 管理平台
              </p>
              <p className="text-xs text-neutral-500">
                多账号 Codex 编程代理管理工具
              </p>
            </div>
            <span className="rounded-md bg-surface-3 px-3 py-1 text-xs text-neutral-400">
              v0.1.2
            </span>
          </div>
          <div className="border-t border-white/[0.06]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">Codex CLI</p>
              <p className="text-xs text-neutral-500">
                {cliInfo?.found
                  ? cliInfo.path ?? "已检测到"
                  : "未检测到 — npm install -g @openai/codex"}
              </p>
            </div>
            <span className={`rounded-md px-3 py-1 text-xs font-medium ${cliInfo?.found ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
              {cliInfo?.found ? cliInfo.version ?? "已安装" : "未安装"}
            </span>
          </div>
          <div className="border-t border-white/[0.06]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-300">检查更新</p>
              {updateStatus && (
                <p className="text-xs text-neutral-500">{updateStatus}</p>
              )}
            </div>
            <button
              disabled={checkingUpdate}
              onClick={async () => {
                setCheckingUpdate(true);
                setUpdateStatus(null);
                try {
                  const { check } = await import("@tauri-apps/plugin-updater");
                  const update = await check();
                  if (update) {
                    setUpdateStatus(`发现新版本 ${update.version}`);
                    setPendingUpdate({
                      version: update.version,
                      install: async () => {
                        setUpdateStatus("下载中...");
                        await update.downloadAndInstall();
                        setUpdateStatus("安装完成，即将重启...");
                        const { relaunch } = await import("@tauri-apps/plugin-process");
                        await relaunch();
                      },
                    });
                  } else {
                    setUpdateStatus("已是最新版本");
                  }
                } catch (e) {
                  setUpdateStatus(`检查失败: ${e}`);
                } finally {
                  setCheckingUpdate(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:border-white/[0.12] hover:text-neutral-200 disabled:opacity-50"
            >
              {checkingUpdate ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              检查更新
            </button>
          </div>
        </div>
      </section>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!pendingUpdate}
        title="发现新版本"
        message={`新版本 ${pendingUpdate?.version ?? ""} 已可用，是否立即下载并安装？安装完成后应用将自动重启。`}
        confirmLabel="立即更新"
        cancelLabel="稍后"
        onConfirm={async () => {
          const install = pendingUpdate?.install;
          setPendingUpdate(null);
          if (install) {
            try { await install(); } catch (e) { setUpdateStatus(`更新失败: ${e}`); }
          }
        }}
        onCancel={() => setPendingUpdate(null)}
      />
    </>
  );
}
