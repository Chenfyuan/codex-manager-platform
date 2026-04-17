import { create } from "zustand";

export type HeaderActionVariant = "ghost" | "primary" | "danger";
export type HeaderActionIcon = "plus" | "refresh" | "play" | "stop";

export interface HeaderSegmentOption {
  id: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export interface HeaderSegmentGroup {
  id: string;
  options: HeaderSegmentOption[];
}

export interface HeaderAction {
  id: string;
  label: string;
  icon?: HeaderActionIcon;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: HeaderActionVariant;
}

interface UIState {
  currentView: "dashboard" | "settings" | "stats" | "prompts" | "sessions" | "proxy";
  setCurrentView: (view: UIState["currentView"]) => void;
  addAccountDialogOpen: boolean;
  addAccountDialogInitialTab: "manual" | "import";
  setAddAccountDialogOpen: (open: boolean) => void;
  settingsDrawerOpen: boolean;
  setSettingsDrawerOpen: (open: boolean) => void;
  headerSegments: HeaderSegmentGroup[];
  setHeaderSegments: (groups: HeaderSegmentGroup[]) => void;
  clearHeaderSegments: () => void;
  headerActions: HeaderAction[];
  setHeaderActions: (actions: HeaderAction[]) => void;
  clearHeaderActions: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentView: "dashboard",
  setCurrentView: (view) =>
    set((state) =>
      view === "settings"
        ? {
            currentView:
              state.currentView === "settings" ? "dashboard" : state.currentView,
            settingsDrawerOpen: true,
          }
        : { currentView: view, settingsDrawerOpen: false },
    ),
  addAccountDialogOpen: false,
  addAccountDialogInitialTab: "manual",
  setAddAccountDialogOpen: (open) =>
    set({
      addAccountDialogOpen: open,
      ...(open ? {} : { addAccountDialogInitialTab: "manual" }),
    }),
  settingsDrawerOpen: false,
  setSettingsDrawerOpen: (open) =>
    set((state) => ({
      settingsDrawerOpen: open,
      currentView: state.currentView === "settings" ? "dashboard" : state.currentView,
    })),
  headerSegments: [],
  setHeaderSegments: (groups) => set({ headerSegments: groups }),
  clearHeaderSegments: () => set({ headerSegments: [] }),
  headerActions: [],
  setHeaderActions: (actions) => set({ headerActions: actions }),
  clearHeaderActions: () => set({ headerActions: [] }),
}));
