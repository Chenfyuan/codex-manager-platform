import { useState, useEffect, useCallback } from "react";
import {
  Network,
  Plus,
  Trash2,
  Copy,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  ArrowRightLeft,
  Power,
  Globe,
  Edit3,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import {
  proxyStart,
  proxyStop,
  proxyGetStatus,
  proxyGetLogs,
  proxyGetProviders,
  proxyAddProvider,
  proxyRemoveProvider,
  proxyUpdateProvider,
  proxyReloadProviders,
  proxyFetchRemoteModels,
} from "@/lib/tauri";
import { useDialogKeyboard } from "@/hooks/useDialogKeyboard";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { ProxyProvider, ProxyStatus, ProxyLog, ModelMapping, RemoteModel } from "@/lib/types";

const PROVIDER_PRESETS: Record<string, { baseUrl: string; models: ModelMapping[] }> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com",
    models: [
      { from: "gpt-4o", to: "claude-sonnet-4-20250514" },
      { from: "gpt-4", to: "claude-sonnet-4-20250514" },
      { from: "o3", to: "claude-opus-4-20250515" },
      { from: "claude-sonnet", to: "claude-sonnet-4-20250514" },
      { from: "claude-opus", to: "claude-opus-4-20250515" },
    ],
  },
  openai: {
    baseUrl: "https://api.openai.com",
    models: [],
  },
};

function ProviderDialog({
  open,
  onClose,
  onSaved,
  editProvider,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editProvider?: ProxyProvider | null;
}) {
  const isEdit = !!editProvider;
  const [name, setName] = useState("");
  const [providerType, setProviderType] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("https://api.anthropic.com");
  const [models, setModels] = useState<ModelMapping[]>(PROVIDER_PRESETS.anthropic.models);
  const [saving, setSaving] = useState(false);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    if (open && editProvider) {
      setName(editProvider.name);
      setProviderType(editProvider.providerType);
      setApiKey(editProvider.apiKey);
      setBaseUrl(editProvider.baseUrl);
      setModels([...editProvider.models]);
      setRemoteModels([]);
    } else if (open && !editProvider) {
      setName("");
      setApiKey("");
      setBaseUrl(PROVIDER_PRESETS.anthropic.baseUrl);
      setModels([...PROVIDER_PRESETS.anthropic.models]);
      setRemoteModels([]);
      setProviderType("anthropic");
    }
  }, [open, editProvider]);

  const handleAddModel = () => {
    setModels([...models, { from: "", to: "" }]);
  };

  const handleRemoveModel = (idx: number) => {
    setModels(models.filter((_, i) => i !== idx));
  };

  const handleModelChange = (idx: number, field: "from" | "to", value: string) => {
    const updated = [...models];
    updated[idx] = { ...updated[idx], [field]: value };
    setModels(updated);
  };

  const handleFetchModels = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) {
      toast("error", "请先填写 API Key 和 Base URL");
      return;
    }
    setFetchingModels(true);
    try {
      const result = await proxyFetchRemoteModels({
        providerType,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
      });
      setRemoteModels(result);
      if (result.length > 0) {
        toast("success", `获取到 ${result.length} 个可用模型`);
      } else {
        toast("error", "未获取到模型");
      }
    } catch (e) {
      toast("error", `获取模型失败: ${e}`);
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSelectRemoteModel = (idx: number, remoteId: string) => {
    const updated = [...models];
    updated[idx] = { ...updated[idx], to: remoteId };
    setModels(updated);
  };

  const handleSubmit = async () => {
    if (!name.trim() || !apiKey.trim()) return;
    setSaving(true);
    try {
      const filteredModels = models.filter((m) => m.from && m.to);
      if (isEdit && editProvider) {
        await proxyUpdateProvider({
          id: editProvider.id,
          name: name.trim(),
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          modelsJson: JSON.stringify(filteredModels),
          enabled: editProvider.enabled,
        });
        toast("success", "已更新提供商");
      } else {
        await proxyAddProvider({
          name: name.trim(),
          providerType,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim(),
          modelsJson: JSON.stringify(filteredModels),
        });
        toast("success", "已添加提供商");
      }
      onSaved();
      onClose();
    } catch (e) {
      toast("error", `${isEdit ? "更新" : "添加"}失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  useDialogKeyboard({ open, onClose, onSubmit: handleSubmit });

  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-neutral-500">⌘↵ 提交 · Esc 关闭</span>
      <div className="flex gap-3">
        <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200">
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || !apiKey.trim() || saving}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? (isEdit ? "保存中..." : "添加中...") : (isEdit ? "保存" : "添加")}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑提供商" : "添加模型提供商"}
      icon={<Network size={15} className="text-primary-400" />}
      footer={footer}
      width="w-[520px]"
    >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">提供商名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：Claude API"
              className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
            />
          </div>

          {!isEdit && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">提供商类型</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setProviderType("anthropic")}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                    providerType === "anthropic"
                      ? "border-primary-500 bg-primary-600/10 text-primary-400"
                      : "border-white/[0.08] bg-surface-2 text-neutral-400 hover:border-white/[0.12]"
                  }`}
                >
                  <Globe size={16} />
                  Anthropic (Claude)
                </button>
                <button
                  onClick={() => setProviderType("openai")}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                    providerType === "openai"
                      ? "border-primary-500 bg-primary-600/10 text-primary-400"
                      : "border-white/[0.08] bg-surface-2 text-neutral-400 hover:border-white/[0.12]"
                  }`}
                >
                  <Globe size={16} />
                  OpenAI / LiteLLM
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">API Base URL</label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-neutral-300">模型映射</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleFetchModels}
                  disabled={fetchingModels || !apiKey.trim() || !baseUrl.trim()}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
                >
                  {fetchingModels ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                  获取可用模型
                </button>
                <button
                  onClick={handleAddModel}
                  className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
                >
                  <Plus size={12} />
                  添加映射
                </button>
              </div>
            </div>
            <p className="text-[11px] text-neutral-500">左侧填 Codex 请求的模型名，右侧选择/填写实际转发的模型</p>
            <div className="max-h-48 space-y-2 overflow-y-auto">
              {models.map((m, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={m.from}
                    onChange={(e) => handleModelChange(i, "from", e.target.value)}
                    placeholder="请求模型名"
                    className="flex-1 rounded-md border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-primary-500"
                  />
                  <ArrowRightLeft size={12} className="shrink-0 text-neutral-500" />
                  {remoteModels.length > 0 ? (
                    <select
                      value={m.to}
                      onChange={(e) => handleSelectRemoteModel(i, e.target.value)}
                      className="flex-1 rounded-md border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-primary-500"
                    >
                      <option value="">选择模型...</option>
                      {remoteModels.map((rm) => (
                        <option key={rm.id} value={rm.id}>
                          {rm.displayName} ({rm.id})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={m.to}
                      onChange={(e) => handleModelChange(i, "to", e.target.value)}
                      placeholder="实际模型名"
                      className="flex-1 rounded-md border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-xs text-neutral-200 outline-none focus:border-primary-500"
                    />
                  )}
                  <button onClick={() => handleRemoveModel(i)} className="shrink-0 text-neutral-500 hover:text-rose-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
            {remoteModels.length > 0 && (
              <p className="text-[10px] text-emerald-400/70">
                ✓ 已获取 {remoteModels.length} 个远程模型，右侧可下拉选择
              </p>
            )}
          </div>

        </div>
    </Drawer>
  );
}

export function ProxyView() {
  const setHeaderActions = useUIStore((s) => s.setHeaderActions);
  const clearHeaderActions = useUIStore((s) => s.clearHeaderActions);
  const [status, setStatus] = useState<ProxyStatus | null>(null);
  const [providers, setProviders] = useState<ProxyProvider[]>([]);
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [port, setPort] = useState("8766");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editingProvider, setEditingProvider] = useState<ProxyProvider | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [s, p, l] = await Promise.all([
        proxyGetStatus(),
        proxyGetProviders(),
        proxyGetLogs(30),
      ]);
      setStatus(s);
      setProviders(p);
      setLogs(l);
    } catch (e) {
      toast("error", `加载代理状态失败: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(async () => {
      try {
        const [s, l] = await Promise.all([proxyGetStatus(), proxyGetLogs(30)]);
        setStatus(s);
        setLogs(l);
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, [status?.running]);

  const handleStart = async () => {
    if (providers.length === 0) {
      toast("error", "请先添加至少一个模型提供商");
      return;
    }
    setStarting(true);
    try {
      const actualPort = await proxyStart(parseInt(port) || 0);
      setPort(String(actualPort));
      toast("success", `代理服务已启动在端口 ${actualPort}`);
      loadData();
    } catch (e) {
      toast("error", `启动失败: ${e}`);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    try {
      await proxyStop();
      toast("success", "代理服务已停止");
      loadData();
    } catch (e) {
      toast("error", `停止失败: ${e}`);
    }
  };

  const handleRemoveProvider = async (id: string) => {
    try {
      await proxyRemoveProvider(id);
      toast("success", "已删除提供商");
      loadData();
      if (status?.running) {
        await proxyReloadProviders();
      }
    } catch (e) {
      toast("error", `删除失败: ${e}`);
    }
  };

  const handleToggleProvider = async (provider: ProxyProvider) => {
    try {
      await proxyUpdateProvider({
        id: provider.id,
        name: provider.name,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        modelsJson: JSON.stringify(provider.models),
        enabled: !provider.enabled,
      });
      loadData();
      if (status?.running) {
        await proxyReloadProviders();
      }
    } catch (e) {
      toast("error", `更新失败: ${e}`);
    }
  };

  const copyCommand = () => {
    const url = `http://127.0.0.1:${status?.port || port}`;
    const cmd = `OPENAI_BASE_URL=${url} codex`;
    navigator.clipboard?.writeText(cmd).catch(() => {});
    toast("success", "已复制启动命令");
  };

  useEffect(() => {
    setHeaderActions([
      {
        id: "proxy-start-stop",
        label: status?.running ? "停止代理" : "启动代理",
        icon: status?.running ? "stop" : "play",
        onClick: status?.running ? handleStop : handleStart,
        disabled: !status?.running && providers.length === 0,
        loading: starting,
        variant: status?.running ? "danger" : "ghost",
      },
      {
        id: "proxy-add-provider",
        label: "添加供应商",
        icon: "plus",
        onClick: () => setAddDialogOpen(true),
        variant: "primary",
      },
    ]);
  }, [handleStart, handleStop, providers.length, setHeaderActions, starting, status?.running]);

  useEffect(() => {
    return () => clearHeaderActions();
  }, [clearHeaderActions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="animate-spin text-neutral-500" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-200">
          <Network size={18} />
          API 反向代理
        </h2>
        <div className="flex items-center gap-2">
          {status?.running && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              运行中 · 端口 {status.port}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-4 shadow-sm shadow-black/20">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-neutral-400">端口</label>
            <input
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              disabled={status?.running}
              className="w-20 rounded-md border border-white/[0.08] bg-surface-2 px-3 py-1.5 text-center text-sm text-neutral-200 outline-none focus:border-primary-500 disabled:opacity-50"
            />
          </div>
          <div className="flex-1" />
        </div>

        {status?.running && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-white/[0.06] bg-surface-2 px-3 py-2">
            <code className="flex-1 text-xs text-primary-300">
              OPENAI_BASE_URL=http://127.0.0.1:{status.port} codex
            </code>
            <button onClick={copyCommand} className="shrink-0 text-neutral-400 hover:text-neutral-200">
              <Copy size={14} />
            </button>
          </div>
        )}

        {status?.running && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/[0.06] bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-semibold tabular-nums text-neutral-200">{status.requestCount}</p>
              <p className="text-[10px] text-neutral-500">总请求</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-semibold tabular-nums text-neutral-200">{providers.filter((p) => p.enabled).length}</p>
              <p className="text-[10px] text-neutral-500">活跃提供商</p>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-surface-2 px-3 py-2 text-center">
              <p className="text-lg font-semibold tabular-nums text-neutral-200">
                {providers.reduce((acc, p) => acc + p.models.length, 0)}
              </p>
              <p className="text-[10px] text-neutral-500">模型映射</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-neutral-300">模型提供商</h3>
        </div>

        {providers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-white/[0.06] bg-surface-1 py-12 shadow-sm shadow-black/20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-teal-500/10">
              <Globe size={32} className="text-primary-400" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-300">暂无提供商</p>
              <p className="mt-1 text-xs text-neutral-500">添加 Claude 等 API 提供商，通过代理让 Codex 使用</p>
            </div>
            <button
              onClick={() => setAddDialogOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              <Plus size={14} />
              添加提供商
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {providers.map((p) => {
              const providerStat = status?.providers.find((s) => s.id === p.id);
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-4 shadow-sm shadow-black/20 transition-all ${
                    p.enabled
                      ? "border-white/[0.06] bg-surface-1"
                      : "border-white/[0.04] bg-surface-1 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                      <Globe size={16} className="text-violet-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-neutral-200">{p.name}</p>
                        <span className="rounded-full border border-white/[0.08] px-1.5 py-px text-[10px] text-neutral-500">
                          {p.providerType}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                        {p.baseUrl} · {p.models.length} 个映射
                        {providerStat && status?.running && (
                          <span className="ml-2 text-neutral-400">
                            {providerStat.requestCount} 请求
                            {providerStat.errorCount > 0 && (
                              <span className="text-rose-400"> · {providerStat.errorCount} 错误</span>
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingProvider(p)}
                        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
                        title="编辑"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => handleToggleProvider(p)}
                        className={`rounded-md p-1.5 transition-colors ${
                          p.enabled
                            ? "text-emerald-400 hover:bg-emerald-500/10"
                            : "text-neutral-500 hover:bg-white/[0.06]"
                        }`}
                        title={p.enabled ? "禁用" : "启用"}
                      >
                        <Power size={14} />
                      </button>
                      <button
                        onClick={() => handleRemoveProvider(p.id)}
                        className="rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {p.models.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {p.models.map((m, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1 rounded-full border border-white/[0.06] bg-surface-2 px-2 py-0.5 text-[10px] text-neutral-400"
                        >
                          {m.from}
                          <ArrowRightLeft size={8} className="text-neutral-600" />
                          <span className="text-primary-400">{m.to}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {status?.running && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-neutral-300">最近请求</h3>
          {logs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-white/[0.06] bg-surface-1 py-8 shadow-sm shadow-black/20">
              <ArrowRightLeft size={24} className="text-neutral-600" />
              <p className="text-xs text-neutral-500">暂无请求记录</p>
              <p className="text-[10px] text-neutral-600">通过代理发送请求后，日志将在此显示</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-surface-1 shadow-sm shadow-black/20">
              <div className="max-h-60 overflow-y-auto">
                {logs.map((log, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-4 py-2.5 text-xs ${
                    i > 0 ? "border-t border-white/[0.04]" : ""
                  }`}
                >
                  {log.status === "ok" ? (
                    <CheckCircle size={12} className="shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle size={12} className="shrink-0 text-rose-400" />
                  )}
                  <span className="text-neutral-400">
                    {new Date(log.timestamp).toLocaleTimeString("zh-CN")}
                  </span>
                  <span className="text-neutral-200">{log.modelRequested}</span>
                  <ArrowRightLeft size={10} className="text-neutral-600" />
                  <span className="text-primary-400">{log.modelActual}</span>
                  <span className="text-neutral-500">{log.provider}</span>
                  <div className="flex-1" />
                  <span className="tabular-nums text-neutral-500">
                    {log.tokensIn + log.tokensOut} tok
                  </span>
                  <span className="flex items-center gap-0.5 tabular-nums text-neutral-500">
                    <Clock size={9} />
                    {log.latencyMs}ms
                  </span>
                </div>
              ))}
            </div>
          </div>
          )}
        </div>
      )}

      <ProviderDialog
        open={addDialogOpen || !!editingProvider}
        onClose={() => { setAddDialogOpen(false); setEditingProvider(null); }}
        onSaved={async () => {
          loadData();
          if (status?.running) {
            await proxyReloadProviders().catch(() => {});
          }
        }}
        editProvider={editingProvider}
      />
    </div>
  );
}
