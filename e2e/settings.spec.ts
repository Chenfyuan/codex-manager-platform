import { test, expect } from "./fixtures";

test.describe("设置页 - 主题切换", () => {
  test("显示三种主题选项", async ({ mockPage: page }) => {
    await page.getByText("设置").click();
    await expect(page.getByText("浅色")).toBeVisible();
    await expect(page.getByText("深色")).toBeVisible();
    await expect(page.getByText("跟随系统")).toBeVisible();
  });

  test("点击浅色主题", async ({ mockPage: page }) => {
    await page.getByText("设置").click();
    await page.getByText("浅色").click();
    await page.waitForTimeout(200);
    const lightBtn = page.getByText("浅色");
    await expect(lightBtn).toBeVisible();
  });

  test("显示 CLI 检测状态", async ({ mockPage: page }) => {
    await page.getByText("设置").click();
    await expect(page.getByText("Codex 可执行文件路径")).toBeVisible();
  });

  test("显示版本号", async ({ mockPage: page }) => {
    await page.getByText("设置").click();
    await expect(page.getByText("v0.1.2")).toBeVisible();
  });

  test("自动重连开关可点击", async ({ mockPage: page }) => {
    await page.getByText("设置").click();
    await expect(page.getByText("自动重连")).toBeVisible();
    const toggle = page.locator("button").filter({ has: page.locator("div.rounded-full") });
    if (await toggle.count() > 0) {
      await toggle.first().click();
    }
  });
});
