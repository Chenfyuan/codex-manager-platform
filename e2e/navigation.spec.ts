import { test, expect } from "./fixtures";

test.describe("页面导航", () => {
  test("初始页面显示账号管理", async ({ mockPage: page }) => {
    await expect(page.getByText("账号管理")).toBeVisible();
    await expect(page.getByText("尚未配置账号")).toBeVisible();
  });

  test("点击设置图标导航到设置页", async ({ mockPage: page }) => {
    const buttons = page.locator("header button");
    await buttons.last().click();
    await expect(page.getByText("常规")).toBeVisible();
    await expect(page.getByText("外观")).toBeVisible();
  });

  test("点击账号管理返回主页", async ({ mockPage: page }) => {
    const buttons = page.locator("header button");
    await buttons.last().click();
    await expect(page.getByText("常规")).toBeVisible();

    await page.getByText("账号管理").click();
    await expect(page.getByText("尚未配置账号")).toBeVisible();
  });

  test("空状态下显示手动添加和导入按钮", async ({ mockPage: page }) => {
    await expect(page.getByRole("button", { name: "手动添加" })).toBeVisible();
    await expect(page.getByRole("button", { name: "导入已有" })).toBeVisible();
  });
});
