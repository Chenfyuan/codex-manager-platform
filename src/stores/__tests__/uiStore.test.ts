import { describe, it, expect, beforeEach } from "vitest";
import { useUIStore } from "@/stores/uiStore";

describe("uiStore", () => {
  beforeEach(() => {
    useUIStore.setState({
      currentView: "dashboard",
      addAccountDialogOpen: false,
      addAccountDialogInitialTab: "manual",
      settingsDrawerOpen: false,
      headerSegments: [],
      headerActions: [],
    });
  });

  it("setCurrentView changes view", () => {
    useUIStore.getState().setCurrentView("settings");
    expect(useUIStore.getState().currentView).toBe("dashboard");
    expect(useUIStore.getState().settingsDrawerOpen).toBe(true);
  });

  it("setAddAccountDialogOpen(true) opens dialog", () => {
    useUIStore.getState().setAddAccountDialogOpen(true);
    expect(useUIStore.getState().addAccountDialogOpen).toBe(true);
  });

  it("setAddAccountDialogOpen(false) resets initialTab to manual", () => {
    useUIStore.setState({ addAccountDialogInitialTab: "import" });
    useUIStore.getState().setAddAccountDialogOpen(false);
    expect(useUIStore.getState().addAccountDialogOpen).toBe(false);
    expect(useUIStore.getState().addAccountDialogInitialTab).toBe("manual");
  });

  it("setSettingsDrawerOpen toggles settings drawer", () => {
    useUIStore.getState().setSettingsDrawerOpen(true);
    expect(useUIStore.getState().settingsDrawerOpen).toBe(true);

    useUIStore.getState().setSettingsDrawerOpen(false);
    expect(useUIStore.getState().settingsDrawerOpen).toBe(false);
  });

  it("setHeaderSegments and clearHeaderSegments update title bar segments", () => {
    useUIStore.getState().setHeaderSegments([
      {
        id: "stats-range",
        options: [{ id: "7d", label: "7天", onClick: () => {}, active: true }],
      },
    ]);
    expect(useUIStore.getState().headerSegments).toHaveLength(1);

    useUIStore.getState().clearHeaderSegments();
    expect(useUIStore.getState().headerSegments).toEqual([]);
  });

  it("setHeaderActions and clearHeaderActions update title bar actions", () => {
    useUIStore.getState().setHeaderActions([
      {
        id: "test-action",
        label: "测试动作",
        onClick: () => {},
        variant: "primary",
      },
    ]);
    expect(useUIStore.getState().headerActions).toHaveLength(1);

    useUIStore.getState().clearHeaderActions();
    expect(useUIStore.getState().headerActions).toEqual([]);
  });
});
