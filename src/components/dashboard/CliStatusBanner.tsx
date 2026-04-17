import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { detectCodexCli, type CodexCliInfo } from "@/lib/tauri";

export function CliStatusBanner() {
  const [info, setInfo] = useState<CodexCliInfo | null>(null);

  useEffect(() => {
    detectCodexCli().then(setInfo).catch(() => {});
  }, []);

  if (info === null || info.found) return null;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm">
      <AlertTriangle size={16} className="shrink-0 text-warning" />
      <div className="flex-1">
        <p className="font-medium text-neutral-200">未检测到 Codex CLI</p>
        <p className="mt-0.5 text-xs text-neutral-500">
          请先安装 Codex CLI 才能连接账号和执行任务
        </p>
      </div>
      <a
        href="https://github.com/openai/codex"
        target="_blank"
        rel="noopener noreferrer"
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20"
      >
        安装指南
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
