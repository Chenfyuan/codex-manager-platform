import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsView } from "@/components/dashboard/SettingsView";
import { useThemeStore } from "@/stores/themeStore";
import { getSettingsSnapshot } from "@/lib/tauri";

const mockSnapshot = vi.mocked(getSettingsSnapshot);

describe("SettingsView", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSnapshot.mockResolvedValue({
      cliInfo: { found: true, path: "/usr/bin/codex", version: "1.0.0" },
      adminKey: null,
      quotaThreshold: 95,
      notifyEnabled: true,
      autoSwitchEnabled: true,
      pollInterval: 300,
      scheduleStrategy: "manual",
      rules: [],
    });
    useThemeStore.setState({ theme: "dark", resolvedTheme: "dark" });
  });

  it("renders section headings", () => {
    render(<SettingsView open={true} onClose={onClose} />);
    expect(screen.getByText("Codex CLI")).toBeInTheDocument();
    expect(screen.getByText("外观")).toBeInTheDocument();
    expect(screen.getByText("关于")).toBeInTheDocument();
  });

  it("shows version", () => {
    render(<SettingsView open={true} onClose={onClose} />);
    expect(screen.getByText("v0.1.2")).toBeInTheDocument();
  });

  it("renders three theme buttons", () => {
    render(<SettingsView open={true} onClose={onClose} />);
    expect(screen.getByText("浅色")).toBeInTheDocument();
    expect(screen.getByText("深色")).toBeInTheDocument();
    expect(screen.getByText("跟随系统")).toBeInTheDocument();
  });

  it("clicking theme button changes theme", async () => {
    const user = userEvent.setup();
    render(<SettingsView open={true} onClose={onClose} />);
    await user.click(screen.getByText("浅色"));
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("shows CLI status", async () => {
    render(<SettingsView open={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText("1.0.0")).toBeInTheDocument();
    });
  });
});
