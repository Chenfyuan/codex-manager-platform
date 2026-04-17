import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.04] px-6 py-12">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/15">
            <AlertTriangle size={24} className="text-rose-400" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-neutral-200">
              {this.props.fallbackTitle || "页面渲染出错"}
            </p>
            <p className="mt-1 max-w-md text-xs text-neutral-500">
              {this.state.error?.message || "未知错误"}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-surface-2 px-4 py-2 text-sm text-neutral-300 transition-colors hover:border-white/[0.12] hover:text-neutral-200"
          >
            <RotateCcw size={14} />
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
