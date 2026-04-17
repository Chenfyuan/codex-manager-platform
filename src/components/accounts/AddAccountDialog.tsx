import { useState, useEffect } from "react";
import {
  Key,
  Globe,
  Loader2,
  ExternalLink,
  Download,
  Check,
  Plus,
  Tag,
} from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import {
  addAccount,
  startOAuthLogin,
  detectExistingCredentials,
  importAccount,
  getAllTags,
  type DetectedCredential,
} from "@/lib/tauri";
import { useAccountStore } from "@/stores/accountStore";
import type { Account, AuthMethod } from "@/lib/types";

type DialogTab = "manual" | "import";

interface AddAccountDialogProps {
  open: boolean;
  onClose: () => void;
  initialTab?: DialogTab;
}

export function AddAccountDialog({
  open,
  onClose,
  initialTab = "manual",
}: AddAccountDialogProps) {
  const [tab, setTab] = useState<DialogTab>(initialTab);
  const [name, setName] = useState("");
  const [authMethod, setAuthMethod] = useState<AuthMethod>("api_key");
  const [credential, setCredential] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedCreds, setDetectedCreds] = useState<DetectedCredential[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [tag, setTag] = useState("");
  const [existingTags, setExistingTags] = useState<string[]>([]);

  const storeAddAccount = useAccountStore((s) => s.addAccount);

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setError(null);
      getAllTags().then(setExistingTags).catch(() => {});
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (open && tab === "import" && detectedCreds.length === 0) {
      setDetectLoading(true);
      detectExistingCredentials()
        .then(setDetectedCreds)
        .catch(() => {})
        .finally(() => setDetectLoading(false));
    }
  }, [open, tab, detectedCreds.length]);

  const resetForm = () => {
    setName("");
    setCredential("");
    setTag("");
    setError(null);
    setDetectedCreds([]);
    setImported(new Set());
    onClose();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!name.trim()) return;
    if (authMethod === "api_key" && !credential.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const cred = authMethod === "api_key" ? credential.trim() : credential;
      const account = await addAccount({
        name: name.trim(),
        authMethod,
        credential: cred,
        tag: tag.trim() || null,
      });
      storeAddAccount(account as unknown as Account);
      resetForm();
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthLogin = async () => {
    setOauthLoading(true);
    setError(null);
    try {
      const authJson = await startOAuthLogin();
      setCredential(authJson);
    } catch (err) {
      setError(String(err));
    } finally {
      setOauthLoading(false);
    }
  };

  const handleImport = async (cred: DetectedCredential) => {
    setImporting(cred.displayName);
    setError(null);
    try {
      const importName =
        cred.source === "env"
          ? cred.displayName.replace("环境变量 ", "")
          : "ChatGPT OAuth";
      const account = await importAccount({
        name: importName,
        authMethod: cred.authMethod,
        credential: cred.credentialValue,
        source: cred.source,
      });
      storeAddAccount(account as unknown as Account);
      setImported((prev) => new Set([...prev, cred.displayName]));
    } catch (err) {
      setError(String(err));
    } finally {
      setImporting(null);
    }
  };

  const handleRefreshDetect = () => {
    setDetectLoading(true);
    setDetectedCreds([]);
    detectExistingCredentials()
      .then(setDetectedCreds)
      .catch(() => {})
      .finally(() => setDetectLoading(false));
  };

  const canSubmit =
    name.trim() &&
    ((authMethod === "api_key" && credential.trim()) ||
      (authMethod === "oauth" && credential.startsWith("{")));

  const footer = tab === "manual" ? (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-neutral-500">Esc 关闭</span>
      <div className="flex gap-3">
        <button
          onClick={resetForm}
          className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
        >
          取消
        </button>
        <button
          onClick={() => handleSubmit()}
          disabled={!canSubmit || submitting}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {submitting ? "添加中..." : "添加"}
        </button>
      </div>
    </div>
  ) : (
    <div className="flex justify-end">
      <button
        onClick={resetForm}
        className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
      >
        关闭
      </button>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={resetForm}
      title="添加账号"
      icon={<Plus size={16} className="text-primary-400" />}
      footer={footer}
    >
      <div className="mb-5 flex gap-1 rounded-lg bg-surface-2 p-1">
        <button
          onClick={() => setTab("manual")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            tab === "manual"
              ? "bg-surface-3 text-neutral-200"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <Plus size={14} />
          手动添加
        </button>
        <button
          onClick={() => setTab("import")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
            tab === "import"
              ? "bg-surface-3 text-neutral-200"
              : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          <Download size={14} />
          导入已有
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg bg-error/10 px-4 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {tab === "manual" ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">账号名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：个人账号、工作账号"
              className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">认证方式</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setAuthMethod("api_key"); setCredential(""); }}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  authMethod === "api_key"
                    ? "border-primary-500 bg-primary-600/10 text-primary-400"
                    : "border-white/[0.08] bg-surface-2 text-neutral-400 hover:border-white/[0.12]"
                }`}
              >
                <Key size={16} />
                API Key
              </button>
              <button
                type="button"
                onClick={() => { setAuthMethod("oauth"); setCredential(""); }}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  authMethod === "oauth"
                    ? "border-primary-500 bg-primary-600/10 text-primary-400"
                    : "border-white/[0.08] bg-surface-2 text-neutral-400 hover:border-white/[0.12]"
                }`}
              >
                <Globe size={16} />
                OAuth
              </button>
            </div>
          </div>

          {authMethod === "api_key" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-neutral-300">API Key</label>
              <input
                type="password"
                value={credential}
                onChange={(e) => setCredential(e.target.value)}
                placeholder="sk-..."
                className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
              />
              <p className="text-xs text-neutral-500">凭证将安全存储在本地数据库中</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="text-sm font-medium text-neutral-300">ChatGPT OAuth 登录</label>
              {credential && credential.startsWith("{") ? (
                <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
                  <Check size={16} />
                  已完成 OAuth 授权
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleOAuthLogin}
                  disabled={oauthLoading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-3 text-sm text-neutral-300 transition-colors hover:border-white/[0.12] hover:text-neutral-200 disabled:opacity-50"
                >
                  {oauthLoading ? (
                    <><Loader2 size={16} className="animate-spin" /> 等待浏览器授权...</>
                  ) : (
                    <><ExternalLink size={16} /> 打开浏览器登录</>
                  )}
                </button>
              )}
              <p className="text-xs text-neutral-500">将打开系统浏览器完成 ChatGPT 授权</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-neutral-300">分组标签</label>
            <div className="flex items-center gap-2">
              <Tag size={14} className="shrink-0 text-neutral-500" />
              <input
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="例如：工作、个人、测试（可选）"
                className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
              />
            </div>
            {existingTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {existingTags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTag(t)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                      tag === t
                        ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                        : "border-white/[0.08] text-neutral-500 hover:border-white/[0.12] hover:text-neutral-300"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-neutral-500">
            自动检测系统中已有的 Codex / OpenAI 凭证，一键导入。
          </p>

          {detectLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 size={16} className="animate-spin" />
              正在检测...
            </div>
          ) : detectedCreds.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <p className="text-sm text-neutral-500">未检测到已有凭证</p>
              <p className="text-xs text-neutral-600">
                支持检测 CODEX_API_KEY、OPENAI_API_KEY 环境变量和 ~/.codex/auth.json
              </p>
              <button
                onClick={handleRefreshDetect}
                className="mt-2 flex items-center gap-2 rounded-lg bg-surface-3 px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-surface-4"
              >
                <Download size={14} />
                重新检测
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {detectedCreds.map((cred) => {
                  const isImported = imported.has(cred.displayName);
                  const isImporting = importing === cred.displayName;
                  return (
                    <div
                      key={cred.displayName}
                      className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-surface-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        {cred.authMethod === "api_key" ? (
                          <Key size={16} className="shrink-0 text-neutral-400" />
                        ) : (
                          <Globe size={16} className="shrink-0 text-neutral-400" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm text-neutral-200">{cred.displayName}</p>
                          <p className="text-xs text-neutral-500">{cred.credentialPreview}</p>
                        </div>
                      </div>
                      {isImported ? (
                        <span className="flex shrink-0 items-center gap-1 text-xs text-success">
                          <Check size={14} />
                          已导入
                        </span>
                      ) : (
                        <button
                          onClick={() => handleImport(cred)}
                          disabled={isImporting}
                          className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
                        >
                          {isImporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                          导入
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleRefreshDetect}
                className="flex items-center gap-2 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
              >
                <Download size={12} />
                重新检测
              </button>
            </>
          )}
        </div>
      )}
    </Drawer>
  );
}
