import { useState, useEffect } from "react";
import {
  History,
  Search,
  FolderOpen,
  MessageSquare,
  ChevronLeft,
  Clock,
  Monitor,
  Loader2,
} from "lucide-react";
import { listCodexSessions, readCodexSession } from "@/lib/tauri";
import { toast } from "@/stores/toastStore";
import type { SessionSummary, SessionMessage } from "@/lib/types";

function formatDate(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function formatFullDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString("zh-CN");
  } catch {
    return ts;
  }
}

function shortenPath(p: string): string {
  return p.replace(/^\/Users\/[^/]+/, "~");
}

export function SessionsView() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<SessionSummary | null>(null);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const list = await listCodexSessions();
        setSessions(list);
      } catch (e) {
        toast("error", `加载会话失败: ${e}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = sessions.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (s.firstMessage?.toLowerCase().includes(q) ?? false) ||
      (s.cwd?.toLowerCase().includes(q) ?? false) ||
      s.id.toLowerCase().includes(q)
    );
  });

  const handleSelect = async (s: SessionSummary) => {
    setSelected(s);
    setLoadingDetail(true);
    try {
      const msgs = await readCodexSession(s.filePath);
      setMessages(msgs);
    } catch (e) {
      toast("error", `读取会话失败: ${e}`);
      setMessages([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  if (selected) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelected(null);
              setMessages([]);
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-neutral-200"
          >
            <ChevronLeft size={16} />
            返回列表
          </button>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-surface-1 p-4 shadow-sm shadow-black/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-neutral-200">
                {selected.firstMessage
                  ? selected.firstMessage.slice(0, 60) +
                    (selected.firstMessage.length > 60 ? "..." : "")
                  : "无标题"}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-neutral-500">
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {formatFullDate(selected.timestamp)}
                </span>
                {selected.cwd && (
                  <span className="flex items-center gap-1">
                    <FolderOpen size={10} />
                    {shortenPath(selected.cwd)}
                  </span>
                )}
                {selected.source && (
                  <span className="flex items-center gap-1">
                    <Monitor size={10} />
                    {selected.source}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <MessageSquare size={10} />
                  {selected.turnCount} 轮对话
                </span>
                {selected.cliVersion && (
                  <span className="text-neutral-600">
                    v{selected.cliVersion}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {loadingDetail ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={20} className="animate-spin text-neutral-500" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-xs text-neutral-500">
            无消息记录
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`rounded-xl border px-4 py-3 ${
                  m.role === "user"
                    ? "border-primary-400/20 bg-primary-500/[0.06]"
                    : "border-white/[0.06] bg-surface-1"
                }`}
              >
                <div className="mb-1.5 flex items-center gap-2 text-[10px]">
                  <span
                    className={`font-medium ${
                      m.role === "user"
                        ? "text-primary-400"
                        : "text-emerald-400"
                    }`}
                  >
                    {m.role === "user" ? "你" : "Codex"}
                  </span>
                  {m.timestamp && (
                    <span className="text-neutral-600">
                      {formatDate(m.timestamp)}
                    </span>
                  )}
                </div>
                <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-neutral-300">
                  {m.content}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-medium text-neutral-200">
          <History size={18} />
          Codex 会话历史
        </h2>
        <span className="text-xs text-neutral-500">
          {sessions.length} 个会话
        </span>
      </div>

      <div className="relative">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索会话内容、项目路径..."
          className="w-full rounded-lg border border-white/[0.08] bg-surface-1 py-2 pl-9 pr-3 text-sm text-neutral-200 placeholder-neutral-500 outline-none transition-colors focus:border-primary-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={20} className="animate-spin text-neutral-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 py-16">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500/20 to-teal-500/10">
            <History size={40} className="text-primary-400" />
          </div>
          <div className="text-center">
            <h3 className="text-lg font-medium text-neutral-200">
              {search ? "没有匹配的会话" : "暂无会话记录"}
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-neutral-500">
              {search
                ? "尝试调整搜索关键词"
                : "在终端中使用 Codex 后，会话记录会自动出现在这里。支持搜索和详情查看。"}
            </p>
          </div>
          {!search && (
            <div className="grid max-w-md grid-cols-3 gap-3 text-center">
              {[
                { icon: "💬", title: "对话回顾", desc: "查看完整对话内容" },
                { icon: "🔍", title: "全文搜索", desc: "快速定位关键信息" },
                { icon: "📅", title: "按日归档", desc: "按时间线浏览历史" },
              ].map((item) => (
                <div key={item.title} className="rounded-xl border border-white/[0.06] bg-surface-1 p-3 shadow-sm shadow-black/20">
                  <p className="text-lg">{item.icon}</p>
                  <p className="mt-1 text-xs font-medium text-neutral-300">{item.title}</p>
                  <p className="mt-0.5 text-[10px] text-neutral-500">{item.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => handleSelect(s)}
              className="flex w-full items-start gap-3 rounded-xl border border-white/[0.06] bg-surface-1 px-4 py-3 text-left shadow-sm shadow-black/20 transition-all hover:border-white/[0.12] hover:shadow-md hover:shadow-black/30"
            >
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500/10">
                <MessageSquare size={14} className="text-primary-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-200">
                  {s.firstMessage ?? "无标题"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[11px] text-neutral-500">
                  <span>{formatDate(s.timestamp)}</span>
                  {s.cwd && (
                    <span
                      className="max-w-[180px] truncate"
                      title={s.cwd}
                    >
                      {shortenPath(s.cwd)}
                    </span>
                  )}
                  {s.source && (
                    <span className="rounded-full border border-white/[0.08] px-1.5 py-px text-[10px]">
                      {s.source}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs tabular-nums text-neutral-400">
                  {s.turnCount} 轮
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
