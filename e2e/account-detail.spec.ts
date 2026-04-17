import { test, expect } from "./fixtures";

async function addTestAccount(page: import("@playwright/test").Page, name = "E2E测试账号") {
  const addBtn = page.getByRole("button", { name: "手动添加" });
  if (await addBtn.isVisible().catch(() => false)) {
    await addBtn.click();
  } else {
    await page.getByRole("button", { name: "添加账号" }).click();
  }
  await page.getByPlaceholder("例如：个人账号、工作账号").fill(name);
  await page.getByPlaceholder("sk-...").fill("sk-test-key-e2e");
  await page.locator("button[type='submit']").click();
  await page.waitForTimeout(500);
}

test.describe("账号管理", () => {
  test("添加账号后显示切换按钮", async ({ mockPage: page }) => {
    await addTestAccount(page);
    await expect(page.getByText("切换到此账号")).toBeVisible();
  });

  test("显示查询额度按钮", async ({ mockPage: page }) => {
    await addTestAccount(page);
    await expect(page.getByRole("button", { name: "查询全部额度" })).toBeVisible();
  });

  test("添加多个账号显示卡片", async ({ mockPage: page }) => {
    await addTestAccount(page, "账号A");
    await addTestAccount(page, "账号B");

    await expect(page.locator("h3", { hasText: "账号A" })).toBeVisible();
    await expect(page.locator("h3", { hasText: "账号B" })).toBeVisible();
  });
});
