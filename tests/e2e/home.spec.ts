import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("home shows real knowledge entries and recent updates", async ({
  page,
}) => {
  await loginAsMember(page);

  // 品质知识入口显示真实状态（种子有已发布文章）
  const qualitySection = page
    .locator("main section", { hasText: "品质知识" })
    .first();
  await expect(qualitySection).toContainText("主题");

  // 散热知识无内容 → 空态
  const thermalSection = page
    .locator("main section", { hasText: "散热知识" })
    .first();
  await expect(thermalSection).toContainText("暂无内容");

  // 最近更新按更新时间倒序展示真实文章
  const updates = page.getByRole("region", { name: "最近更新" });
  await expect(updates).toContainText("ANOVA 实例");
  await expect(updates).toContainText("ANOVA 入门");
  await expect(updates).toContainText("SPC 基础");
});

test("recent updates link to the reading page", async ({ page }) => {
  await loginAsMember(page);
  const updates = page.getByRole("region", { name: "最近更新" });
  // 最新文章（updatedAt 最近）是 anova-example
  const first = updates.getByRole("link").first();
  await expect(first).toContainText("ANOVA 实例");
  await first.click();
  await expect(page).toHaveURL(/\/articles\/anova-example$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 实例",
  );
});

test("knowledge entry links from home reach the entry pages", async ({
  page,
}) => {
  await loginAsMember(page);
  await page
    .locator("main section", { hasText: "品质知识" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/quality$/);
  await expect(page.getByRole("heading", { name: "品质知识" })).toBeVisible();
});
