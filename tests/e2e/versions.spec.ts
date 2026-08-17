import { expect, test } from "@playwright/test";

async function loginAsEditor(page: import("@playwright/test").Page) {
  // 若已有会话（例如同测试先以 member 登录），先退出
  const logout = page.getByRole("button", { name: "退出登录" });
  if (await logout.count()) {
    await logout.click();
    await expect(page).toHaveURL(/\/login/);
  }
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("version history page is restricted to editors (ART-07)", async ({
  page,
}) => {
  // 阅读者（member）被拒
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/articles/anova-intro/versions");
  await expect(page).not.toHaveURL(/\/versions$/);

  // 编辑者可访问
  await loginAsEditor(page);
  await page.goto("/articles/anova-intro/versions");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门",
  );
});

test("restoring a version requires a reason (VER-03)", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/articles/anova-intro/versions");

  // 空原因提交 → 浏览器 required 阻止（表单不提交）
  const reasonInput = page.getByLabel(/恢复版本 1 的原因/);
  await expect(reasonInput).toBeVisible();
});

test("archived article shows the archive notice instead of body (VER-04)", async ({
  page,
}) => {
  await loginAsEditor(page);
  await page.goto("/articles/archived-sample");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "旧版入门手册",
  );
  await expect(page.getByText("已归档", { exact: true })).toBeVisible();
  await expect(page.getByText(/正文不再展示/)).toBeVisible();
  await expect(page.getByText("不应展示的正文")).toHaveCount(0);
});
