import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

function createStorageMock() {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageMock,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn().mockResolvedValue(() => {}),
  emit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue("granted"),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-global-shortcut", () => ({
  register: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn().mockReturnValue({
    isVisible: vi.fn().mockResolvedValue(true),
    isFocused: vi.fn().mockResolvedValue(true),
    hide: vi.fn().mockResolvedValue(undefined),
    show: vi.fn().mockResolvedValue(undefined),
    setFocus: vi.fn().mockResolvedValue(undefined),
    minimize: vi.fn().mockResolvedValue(undefined),
    toggleMaximize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-os", () => ({
  platform: vi.fn().mockReturnValue("macos"),
}));

vi.mock("@/lib/tauri", () => ({
  detectCodexCli: vi.fn().mockResolvedValue({ found: true, path: "/usr/bin/codex", version: "1.0.0" }),
  getAccounts: vi.fn().mockResolvedValue([]),
  addAccount: vi.fn().mockResolvedValue({}),
  removeAccount: vi.fn().mockResolvedValue(undefined),
  updateAccountName: vi.fn().mockResolvedValue(undefined),
  updateAccountCredential: vi.fn().mockResolvedValue(undefined),
  startOAuthLogin: vi.fn().mockResolvedValue(""),
  checkOAuthStatus: vi.fn().mockResolvedValue(false),
  detectExistingCredentials: vi.fn().mockResolvedValue([]),
  importAccount: vi.fn().mockResolvedValue({}),
  activateAccount: vi.fn().mockResolvedValue(undefined),
  getActiveCredential: vi.fn().mockResolvedValue(null),
  getActiveAccountId: vi.fn().mockResolvedValue(null),
  checkQuota: vi.fn().mockResolvedValue({ email: null, planType: "unknown", primaryUsedPercent: null, primaryResetsAt: null, primaryWindowMins: null, secondaryUsedPercent: null, secondaryResetsAt: null, secondaryWindowMins: null, creditsBalance: null, error: null }),
  checkAllQuotas: vi.fn().mockResolvedValue([]),
  refreshOAuthToken: vi.fn().mockResolvedValue(""),
  getQuotaHistory: vi.fn().mockResolvedValue([]),
  refreshTrayMenu: vi.fn().mockResolvedValue(undefined),
  exportAccounts: vi.fn().mockResolvedValue("{}"),
  importAccountsFromBackup: vi.fn().mockResolvedValue(0),
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  updateAccountTag: vi.fn().mockResolvedValue(undefined),
  getAllTags: vi.fn().mockResolvedValue([]),
  getDailyStats: vi.fn().mockResolvedValue([]),
  getAccountUsageSummary: vi.fn().mockResolvedValue([]),
  getScheduleRules: vi.fn().mockResolvedValue([]),
  addScheduleRule: vi.fn().mockResolvedValue(1),
  removeScheduleRule: vi.fn().mockResolvedValue(undefined),
  updateAccountPriority: vi.fn().mockResolvedValue(undefined),
  getRecommendedAccount: vi.fn().mockResolvedValue(null),
  getTodaySwitchCount: vi.fn().mockResolvedValue(0),
  cleanupOldData: vi.fn().mockResolvedValue(0),
  getDbSize: vi.fn().mockResolvedValue(1024),
  getQuotaHistoryCount: vi.fn().mockResolvedValue(0),
  getOperationLogs: vi.fn().mockResolvedValue([]),
  clearOperationLogs: vi.fn().mockResolvedValue(0),
  updateModelPreference: vi.fn().mockResolvedValue(undefined),
  isCodexRunning: vi.fn().mockResolvedValue(false),
  getCodexProcesses: vi.fn().mockResolvedValue([]),
  getAccountLaunchCommand: vi.fn().mockResolvedValue("codex"),
  logOperation: vi.fn().mockResolvedValue(undefined),
  reorderAccounts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications", () => ({
  notifyTaskComplete: vi.fn(),
  notifyTaskFailed: vi.fn(),
  notifyQuotaWarning: vi.fn(),
}));
