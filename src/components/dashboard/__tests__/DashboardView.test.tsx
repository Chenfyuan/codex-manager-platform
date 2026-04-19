import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getCodexProcesses, reorderAccounts } from "@/lib/tauri";
import { useAccountStore } from "@/stores/accountStore";
import { useUIStore } from "@/stores/uiStore";
import { makeAccount } from "@/test/helpers";

describe("DashboardView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAccountStore.setState({
      accounts: [],
      selectedAccountId: null,
      activeAccountId: null,
      quotas: {},
      quotaLoading: false,
      tagFilter: null,
    });
    useUIStore.setState({
      currentView: "dashboard",
      addAccountDialogOpen: false,
      addAccountDialogInitialTab: "manual",
    });
  });

  it("shows empty state when no accounts", () => {
    render(<DashboardView />);
    expect(screen.getByText("开始管理你的 Codex 账号")).toBeInTheDocument();
    expect(screen.getByText("添加 API Key")).toBeInTheDocument();
    expect(screen.getByText("导入已有凭证")).toBeInTheDocument();
  });

  it("clicking add opens dialog", async () => {
    const user = userEvent.setup();
    render(<DashboardView />);
    await user.click(screen.getByText("添加 API Key"));
    expect(useUIStore.getState().addAccountDialogOpen).toBe(true);
  });

  it("clicking import opens dialog with import tab", async () => {
    const user = userEvent.setup();
    render(<DashboardView />);
    await user.click(screen.getByText("导入已有凭证"));
    expect(useUIStore.getState().addAccountDialogOpen).toBe(true);
    expect(useUIStore.getState().addAccountDialogInitialTab).toBe("import");
  });

  it("shows account cards with names", () => {
    useAccountStore.setState({
      accounts: [
        makeAccount({ id: "a1", name: "Work" }),
        makeAccount({ id: "a2", name: "Personal" }),
      ],
    });
    render(<DashboardView />);
    expect(screen.getByText("Work")).toBeInTheDocument();
    expect(screen.getByText("Personal")).toBeInTheDocument();
  });

  it("non-active card is clickable for switching", () => {
    useAccountStore.setState({
      accounts: [makeAccount({ id: "a1", name: "Test" })],
      activeAccountId: null,
    });
    render(<DashboardView />);
    expect(screen.getByText("Test")).toBeInTheDocument();
    expect(screen.getByText("未知")).toBeInTheDocument();
  });

  it("supports drag reordering across all accounts", async () => {
    useAccountStore.setState({
      accounts: [
        makeAccount({ id: "a1", name: "First" }),
        makeAccount({ id: "a2", name: "Second" }),
        makeAccount({ id: "a3", name: "Third" }),
      ],
    });

    render(<DashboardView />);

    const firstCard = screen.getByText("First").closest("[draggable='true']");
    const thirdCard = screen.getByText("Third").closest("[draggable='true']");

    expect(firstCard).not.toBeNull();
    expect(thirdCard).not.toBeNull();

    fireEvent.dragStart(thirdCard!);
    fireEvent.dragOver(firstCard!);
    fireEvent.drop(firstCard!);

    await waitFor(() => {
      expect(useAccountStore.getState().accounts.map((account) => account.id)).toEqual(["a3", "a1", "a2"]);
    });
    expect(vi.mocked(reorderAccounts)).toHaveBeenCalledWith(["a3", "a1", "a2"]);
  });

  it("preserves hidden account positions when dragging inside a tag filter", async () => {
    useAccountStore.setState({
      accounts: [
        makeAccount({ id: "a1", name: "Work 1", tag: "工作" }),
        makeAccount({ id: "b1", name: "Personal", tag: "私人" }),
        makeAccount({ id: "a2", name: "Work 2", tag: "工作" }),
      ],
      tagFilter: "工作",
    });

    render(<DashboardView />);

    const firstVisibleCard = screen.getByText("Work 1").closest("[draggable='true']");
    const secondVisibleCard = screen.getByText("Work 2").closest("[draggable='true']");

    expect(firstVisibleCard).not.toBeNull();
    expect(secondVisibleCard).not.toBeNull();

    fireEvent.dragStart(secondVisibleCard!);
    fireEvent.dragOver(firstVisibleCard!);
    fireEvent.drop(firstVisibleCard!);

    await waitFor(() => {
      expect(useAccountStore.getState().accounts.map((account) => account.id)).toEqual(["a2", "b1", "a1"]);
    });
    expect(vi.mocked(reorderAccounts)).toHaveBeenCalledWith(["a2", "b1", "a1"]);
  });

  it("clears the running codex card on the next process poll", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(getCodexProcesses)
        .mockResolvedValueOnce([
          {
            pid: 4321,
            cwd: "/tmp/project",
            elapsedSecs: 12,
            commandArgs: "codex",
          },
        ])
        .mockResolvedValueOnce([])
        .mockResolvedValue([]);

      useAccountStore.setState({
        accounts: [makeAccount({ id: "a1", name: "Work" })],
      });

      render(<DashboardView />);

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByText("Codex 运行中 · 1 个进程")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });

      expect(screen.queryByText("Codex 运行中 · 1 个进程")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
