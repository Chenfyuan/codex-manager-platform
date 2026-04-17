import { useState, useEffect } from "react";
import { Key, Globe, Tag, Cpu, Pencil } from "lucide-react";
import { Drawer } from "@/components/ui/Drawer";
import { updateAccountName, updateAccountCredential, updateAccountTag, getAllTags, updateModelPreference } from "@/lib/tauri";
import { useAccountStore } from "@/stores/accountStore";
import { toast } from "@/stores/toastStore";
import type { Account } from "@/lib/types";

interface EditAccountDialogProps {
  account: Account | null;
  onClose: () => void;
}

export function EditAccountDialog({ account, onClose }: EditAccountDialogProps) {
  const [name, setName] = useState("");
  const [credential, setCredential] = useState("");
  const [tag, setTag] = useState("");
  const [modelPref, setModelPref] = useState("");
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const updateAccountInStore = useAccountStore((s) => s.updateAccountName);
  const updateTagInStore = useAccountStore((s) => s.updateAccountTag);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setCredential("");
      setTag(account.tag ?? "");
      setModelPref(account.modelPreference ?? "");
      getAllTags().then(setExistingTags).catch(() => {});
    }
  }, [account]);

  const handleSave = async () => {
    if (!account) return;
    setSaving(true);
    try {
      if (name.trim() && name.trim() !== account.name) {
        await updateAccountName(account.id, name.trim());
        updateAccountInStore(account.id, name.trim());
      }
      if (credential.trim()) {
        await updateAccountCredential(account.id, credential.trim());
      }
      const newTag = tag.trim() || null;
      if (newTag !== (account.tag ?? null)) {
        await updateAccountTag(account.id, newTag);
        updateTagInStore(account.id, newTag);
      }
      const newModel = modelPref.trim() || null;
      if (newModel !== (account.modelPreference ?? null)) {
        await updateModelPreference(account.id, newModel);
      }
      toast("success", "账号已更新");
      onClose();
    } catch (e) {
      toast("error", `更新失败: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-neutral-500">Esc 关闭</span>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存"}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer
      open={!!account}
      onClose={onClose}
      title="编辑账号"
      icon={<Pencil size={15} className="text-primary-400" />}
      footer={footer}
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">账号名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 outline-none transition-colors focus:border-primary-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">
            {account?.authMethod === "oauth" ? "更新 OAuth 凭证" : "更新 API Key"}
          </label>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5">
            {account?.authMethod === "oauth" ? (
              <Globe size={14} className="text-neutral-500" />
            ) : (
              <Key size={14} className="text-neutral-500" />
            )}
            <input
              type="password"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="留空则不修改"
              className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
            />
          </div>
          <p className="text-xs text-neutral-500">
            当前认证方式: {account?.authMethod === "oauth" ? "OAuth" : "API Key"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">分组标签</label>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5">
            <Tag size={14} className="text-neutral-500" />
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="例如：工作、个人、测试（可选）"
              className="flex-1 bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
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

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">模型偏好</label>
          <div className="flex items-center gap-2 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5">
            <Cpu size={14} className="text-neutral-500" />
            <select
              value={modelPref}
              onChange={(e) => setModelPref(e.target.value)}
              className="flex-1 bg-transparent text-sm text-neutral-200 outline-none"
            >
              <option value="">跟随全局设置</option>
              <option value="o3">o3</option>
              <option value="o4-mini">o4-mini</option>
              <option value="gpt-4.1">gpt-4.1</option>
              <option value="gpt-4.1-mini">gpt-4.1-mini</option>
              <option value="gpt-4.1-nano">gpt-4.1-nano</option>
              <option value="gpt-5.4">gpt-5.4</option>
            </select>
          </div>
          <p className="text-xs text-neutral-500">切换到此账号时自动设为 Codex 默认模型</p>
        </div>
      </div>
    </Drawer>
  );
}
