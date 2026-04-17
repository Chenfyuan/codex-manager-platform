import { useState, useEffect, useRef } from "react";
import {
  FileText,
  Plus,
  Search,
  Star,
  Copy,
  Pencil,
  Trash2,
  MoreHorizontal,
  Tag,
  Check,
} from "lucide-react";
import { useDialogKeyboard } from "@/hooks/useDialogKeyboard";
import { Drawer } from "@/components/ui/Drawer";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  getPromptTemplates,
  addPromptTemplate,
  updatePromptTemplate,
  deletePromptTemplate,
  togglePromptFavorite,
  incrementPromptUseCount,
} from "@/lib/tauri";
import { toast } from "@/stores/toastStore";
import { useUIStore } from "@/stores/uiStore";
import type { PromptTemplate } from "@/lib/types";

function CardMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        onClick={() => {
          setOpen(!open);
          setConfirming(false);
        }}
        className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-neutral-300"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 min-w-[120px] rounded-lg border border-white/[0.08] bg-surface-2 py-1 shadow-xl backdrop-blur-xl">
          <button
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 transition-colors hover:bg-white/[0.06]"
          >
            <Pencil size={12} />
            编辑
          </button>
          {confirming ? (
            <button
              onClick={() => {
                onDelete();
                setOpen(false);
                setConfirming(false);
              }}
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

function PromptFormDialog({
  open,
  prompt,
  existingCategories,
  onSave,
  onClose,
}: {
  open: boolean;
  prompt: PromptTemplate | null;
  existingCategories: string[];
  onSave: (title: string, content: string, category: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(prompt?.title ?? "");
  const [content, setContent] = useState(prompt?.content ?? "");
  const [category, setCategory] = useState(prompt?.category ?? "");

  useEffect(() => {
    if (!open) return;
    setTitle(prompt?.title ?? "");
    setContent(prompt?.content ?? "");
    setCategory(prompt?.category ?? "");
  }, [open, prompt]);

  const handleSubmit = () => {
    if (title.trim() && content.trim()) {
      onSave(title.trim(), content.trim(), category.trim());
    }
  };

  useDialogKeyboard({ open, onClose, onSubmit: handleSubmit });

  const footer = (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-neutral-500">⌘↵ 提交 · Esc 关闭</span>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm text-neutral-400 transition-colors hover:bg-surface-3 hover:text-neutral-200"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || !content.trim()}
          className="rounded-lg bg-primary-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:opacity-50"
        >
          {prompt ? "保存" : "创建"}
        </button>
      </div>
    </div>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={prompt ? "编辑模板" : "新建模板"}
      icon={<FileText size={15} className="text-primary-400" />}
      footer={footer}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">模板名称</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：Review PR、写测试"
            className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">Prompt 内容</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="输入 Codex 指令模板...&#10;支持 {{变量}} 占位符"
            rows={8}
            className="w-full resize-none rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
          />
          <p className="text-[11px] text-neutral-500">
            {"使用 {{变量名}} 作为占位符，复制时会提示填入"}
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-neutral-300">分类标签</label>
          <div className="flex items-center gap-2">
            <Tag size={14} className="shrink-0 text-neutral-500" />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：代码审查、测试、重构（可选）"
              className="w-full rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2.5 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
            />
          </div>
          {existingCategories.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {existingCategories.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                    category === c
                      ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                      : "border-white/[0.08] text-neutral-500 hover:border-white/[0.15] hover:text-neutral-300"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
}

export function PromptsView() {
  const setHeaderActions = useUIStore((s) => s.setHeaderActions);
  const clearHeaderActions = useUIStore((s) => s.clearHeaderActions);
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptTemplate | null>(
    null,
  );
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadTemplates = async () => {
    try {
      const list = await getPromptTemplates();
      setTemplates(list);
    } catch (e) {
      toast("error", `加载模板失败: ${e}`);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    setHeaderActions([
      {
        id: "prompt-add",
        label: "新增模板",
        icon: "plus",
        onClick: () => {
          setEditingPrompt(null);
          setShowForm(true);
        },
        variant: "primary",
      },
    ]);
  }, [setHeaderActions]);

  useEffect(() => {
    return () => clearHeaderActions();
  }, [clearHeaderActions]);

  const allCategories = [
    ...new Set(templates.map((t) => t.category).filter(Boolean)),
  ].sort();

  const filtered = templates.filter((t) => {
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        t.title.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleCopy = async (template: PromptTemplate) => {
    try {
      const vars = template.content.match(/\{\{(\w+)\}\}/g);
      let finalContent = template.content;

      if (vars) {
        const uniqueVars = [...new Set(vars)];
        for (const v of uniqueVars) {
          const varName = v.replace(/\{\{|\}\}/g, "");
          const value = window.prompt(`请输入 ${varName} 的值：`);
          if (value === null) return;
          finalContent = finalContent.replaceAll(v, value);
        }
      }

      await writeText(finalContent);
      await incrementPromptUseCount(template.id);
      setCopiedId(template.id);
      setTimeout(() => setCopiedId(null), 1500);
      toast("success", "已复制到剪贴板");
      loadTemplates();
    } catch (e) {
      toast("error", `复制失败: ${e}`);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await togglePromptFavorite(id);
      loadTemplates();
    } catch (e) {
      toast("error", `操作失败: ${e}`);
    }
  };

  const handleSave = async (
    title: string,
    content: string,
    category: string,
  ) => {
    try {
      if (editingPrompt) {
        await updatePromptTemplate(editingPrompt.id, title, content, category);
        toast("success", "模板已更新");
      } else {
        await addPromptTemplate(title, content, category);
        toast("success", "模板已创建");
      }
      setShowForm(false);
      setEditingPrompt(null);
      loadTemplates();
    } catch (e) {
      toast("error", `保存失败: ${e}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePromptTemplate(id);
      toast("success", "模板已删除");
      loadTemplates();
    } catch (e) {
      toast("error", `删除失败: ${e}`);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center">
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-200">
          <FileText size={18} />
          Prompt 模板库
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索模板..."
            className="w-full rounded-lg border border-white/[0.08] bg-surface-1 py-2 pl-9 pr-3 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
          />
        </div>
      </div>

      {allCategories.length > 0 && (
        <div className="flex items-center gap-2">
          <Tag size={13} className="text-neutral-500" />
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setCategoryFilter(null)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                categoryFilter === null
                  ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                  : "border-white/[0.08] text-neutral-500 hover:border-white/[0.15] hover:text-neutral-300"
              }`}
            >
              全部
            </button>
            {allCategories.map((c) => (
              <button
                key={c}
                onClick={() =>
                  setCategoryFilter(categoryFilter === c ? null : c)
                }
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                  categoryFilter === c
                    ? "border-primary-500/50 bg-primary-500/10 text-primary-400"
                    : "border-white/[0.08] text-neutral-500 hover:border-white/[0.15] hover:text-neutral-300"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-teal-500/10 backdrop-blur-sm">
            <FileText size={40} className="text-primary-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-neutral-200">
              {search || categoryFilter ? "没有匹配的模板" : "创建你的第一个模板"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">
              {search || categoryFilter
                ? "尝试调整搜索条件或切换分类"
                : "将常用的 Codex 指令保存为模板，支持变量占位符，一键复制使用。"}
            </p>
          </div>
          {!search && !categoryFilter && (
            <>
              <div className="grid max-w-md grid-cols-3 gap-3 text-center">
                {[
                  { icon: "📝", title: "指令模板", desc: "保存常用 Prompt" },
                  { icon: "🏷️", title: "分类标签", desc: "按场景分组管理" },
                  { icon: "⚡", title: "变量占位", desc: "{{变量}} 动态替换" },
                ].map((item) => (
                  <div key={item.title} className="rounded-xl border border-white/[0.06] bg-surface-1 p-3 shadow-sm shadow-black/20">
                    <p className="text-lg">{item.icon}</p>
                    <p className="mt-1 text-xs font-medium text-neutral-300">{item.title}</p>
                    <p className="mt-0.5 text-[10px] text-neutral-500">{item.desc}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setEditingPrompt(null);
                  setShowForm(true);
                }}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary-600/25 transition-all hover:shadow-primary-500/40 hover:brightness-110"
              >
                <Plus size={16} />
                创建第一个模板
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {filtered.map((t) => (
            <div
              key={t.id}
              className="group relative rounded-xl border border-white/[0.06] bg-surface-1 p-4 shadow-sm shadow-black/20 transition-all hover:border-white/[0.12] hover:shadow-md hover:shadow-black/30"
            >
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-medium text-neutral-200">
                      {t.title}
                    </h3>
                    {t.category && (
                      <span className="flex shrink-0 items-center rounded-full border border-accent-400/25 bg-accent-500/10 px-1.5 py-px text-[10px] font-medium text-accent-400">
                        {t.category}
                      </span>
                    )}
                  </div>
                  {t.useCount > 0 && (
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      已使用 {t.useCount} 次
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    onClick={() => handleToggleFavorite(t.id)}
                    className={`rounded-md p-1 transition-colors ${
                      t.isFavorite
                        ? "text-amber-400 hover:text-amber-300"
                        : "text-neutral-500 hover:bg-white/[0.06] hover:text-amber-400"
                    }`}
                  >
                    <Star
                      size={13}
                      fill={t.isFavorite ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    onClick={() => handleCopy(t)}
                    className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-primary-400"
                  >
                    {copiedId === t.id ? (
                      <Check size={13} className="text-emerald-400" />
                    ) : (
                      <Copy size={13} />
                    )}
                  </button>
                  <CardMenu
                    onEdit={() => {
                      setEditingPrompt(t);
                      setShowForm(true);
                    }}
                    onDelete={() => handleDelete(t.id)}
                  />
                </div>
              </div>

              <pre className="mt-2.5 max-h-24 overflow-hidden whitespace-pre-wrap break-words rounded-lg bg-white/[0.04] px-3 py-2 text-xs leading-relaxed text-neutral-400">
                {t.content}
              </pre>
            </div>
          ))}
        </div>
      )}

      <PromptFormDialog
        open={showForm}
        prompt={editingPrompt}
        existingCategories={allCategories}
        onSave={handleSave}
        onClose={() => {
          setShowForm(false);
          setEditingPrompt(null);
        }}
      />
    </div>
  );
}
