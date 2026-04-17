import { test, expect } from "./fixtures";

test.describe("添加账号对话框", () => {
  test("点击手动添加打开对话框", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();
    await expect(page.getByRole("heading", { name: "添加账号" })).toBeVisible();
    await expect(page.getByPlaceholder("例如：个人账号、工作账号")).toBeVisible();
  });

  test("API Key 表单填写并提交", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();

    await page.getByPlaceholder("例如：个人账号、工作账号").fill("测试账号");
    await page.getByPlaceholder("sk-...").fill("sk-test-key-12345");

    const submitBtn = page.locator("button[type='submit']");
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await page.waitForTimeout(500);
    await expect(page.locator("aside").getByText("测试账号")).toBeVisible();
  });

  test("名称为空时提交按钮禁用", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();

    await page.getByPlaceholder("sk-...").fill("sk-test");
    const submitBtn = page.locator("button[type='submit']");
    await expect(submitBtn).toBeDisabled();
  });

  test("切换到 OAuth 认证方式", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();
    await page.getByRole("button", { name: "OAuth" }).click();
    await expect(page.getByText("打开浏览器登录")).toBeVisible();
  });

  test("切换到导入标签页", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();
    await page.locator(".fixed button", { hasText: "导入已有" }).click();
    await expect(page.getByText("自动检测系统中已有的")).toBeVisible();
  });

  test("取消关闭对话框", async ({ mockPage: page }) => {
    await page.getByRole("button", { name: "手动添加" }).click();
    await expect(page.getByPlaceholder("例如：个人账号、工作账号")).toBeVisible();

    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByPlaceholder("例如：个人账号、工作账号")).not.toBeVisible();
  });
});
