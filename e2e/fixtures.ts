import { test as base, type Page } from "@playwright/test";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const test = base.extend<{ mockPage: Page }>({
  mockPage: async ({ page }, use) => {
    await page.addInitScript({ path: path.resolve(__dirname, "tauri-mock.js") });
    await page.goto("/");
    await page.waitForSelector("text=Codex 管理平台", { timeout: 10_000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
