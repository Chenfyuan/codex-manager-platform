import { create } from "zustand";
import { persist } from "zustand/middleware";
import { emit } from "@tauri-apps/api/event";

type Theme = "dark" | "light" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: "dark" | "light";
}

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      resolvedTheme: "dark",

      setTheme: (theme) => {
        const resolved = theme === "system" ? getSystemTheme() : theme;
        set({ theme, resolvedTheme: resolved });
        applyTheme(resolved);
        emit("theme-changed", { theme, resolved }).catch(() => {});
      },
    }),
    {
      name: "codex-manager-theme",
      onRehydrateStorage: () => (state) => {
        if (state) {
          const resolved =
            state.theme === "system" ? getSystemTheme() : state.theme;
          state.resolvedTheme = resolved;
          applyTheme(resolved);
        }
      },
    },
  ),
);

function applyTheme(theme: "dark" | "light") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
}

if (typeof window !== "undefined") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      const state = useThemeStore.getState();
      if (state.theme === "system") {
        const resolved = getSystemTheme();
        useThemeStore.setState({ resolvedTheme: resolved });
        applyTheme(resolved);
        emit("theme-changed", { theme: "system", resolved }).catch(() => {});
      }
    });
}
