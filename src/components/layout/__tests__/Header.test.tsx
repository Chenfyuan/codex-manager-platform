import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Header } from "@/components/layout/Header";
import { useUIStore } from "@/stores/uiStore";
import { useAccountStore } from "@/stores/accountStore";
import { makeAccount } from "@/test/helpers";

describe("Header", () => {
  beforeEach(() => {
    useUIStore.setState({
      currentView: "dashboard",
      addAccountDialogOpen: false,
      addAccountDialogInitialTab: "manual",
      settingsDrawerOpen: false,
      headerSegments: [],
      headerActions: [],
    });
    useAccountStore.setState({ accounts: [], quotaLoading: false, quotas: {} });
  });

  it("shows 账号管理 nav item", () => {
    render(<Header />);
    expect(screen.getByText("账号管理")).toBeInTheDocument();
  });

  it("shows action buttons when accounts exist", () => {
    useAccountStore.setState({ accounts: [makeAccount({ id: "a1", name: "T" })] });
    render(<Header />);
    expect(screen.getByText("添加")).toBeInTheDocument();
    expect(screen.getByText("刷新")).toBeInTheDocument();
  });

  it("clicking 账号管理 switches to dashboard", async () => {
    useUIStore.setState({ currentView: "proxy" });
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByText("账号管理"));
    expect(useUIStore.getState().currentView).toBe("dashboard");
  });

  it("clicking settings button opens the settings drawer", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByTitle("设置"));
    expect(useUIStore.getState().settingsDrawerOpen).toBe(true);
  });

  it("renders custom title bar actions for non-dashboard views", () => {
    useUIStore.setState({
      currentView: "proxy",
      headerActions: [
        {
          id: "proxy-start",
          label: "启动代理",
          onClick: () => {},
          icon: "play",
        },
        {
          id: "proxy-add",
          label: "添加供应商",
          onClick: () => {},
          icon: "plus",
          variant: "primary",
        },
      ],
    });
    render(<Header />);
    expect(screen.getByText("启动代理")).toBeInTheDocument();
    expect(screen.getByText("添加供应商")).toBeInTheDocument();
  });

  it("renders title bar segment groups for non-dashboard views", () => {
    useUIStore.setState({
      currentView: "stats",
      headerSegments: [
        {
          id: "stats-range",
          options: [
            { id: "7d", label: "7天", onClick: () => {}, active: true },
            { id: "14d", label: "14天", onClick: () => {} },
            { id: "30d", label: "30天", onClick: () => {} },
          ],
        },
      ],
    });
    render(<Header />);
    expect(screen.getByText("7天")).toBeInTheDocument();
    expect(screen.getByText("14天")).toBeInTheDocument();
    expect(screen.getByText("30天")).toBeInTheDocument();
  });
});
