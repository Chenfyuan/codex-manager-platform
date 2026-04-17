import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "@/stores/themeStore";

describe("themeStore", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark", "light");
    useThemeStore.setState({ theme: "dark", resolvedTheme: "dark" });
  });

  it("default theme is dark", () => {
    expect(useThemeStore.getState().theme).toBe("dark");
    expect(useThemeStore.getState().resolvedTheme).toBe("dark");
  });

  it("setTheme to light updates resolvedTheme and applies class", () => {
    useThemeStore.getState().setTheme("light");
    expect(useThemeStore.getState().theme).toBe("light");
    expect(useThemeStore.getState().resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("setTheme to dark applies dark class", () => {
    useThemeStore.getState().setTheme("light");
    useThemeStore.getState().setTheme("dark");
    expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("setTheme to system resolves via matchMedia", () => {
    useThemeStore.getState().setTheme("system");
    expect(useThemeStore.getState().theme).toBe("system");
    expect(["dark", "light"]).toContain(useThemeStore.getState().resolvedTheme);
  });

  it("persist key is codex-manager-theme", () => {
    useThemeStore.getState().setTheme("light");
    const stored = localStorage.getItem("codex-manager-theme");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!);
    expect(parsed.state.theme).toBe("light");
  });
});
