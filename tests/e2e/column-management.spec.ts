import { expect, test } from "@playwright/test";

async function loginAsColumnAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("columnadmin");
  await page.getByLabel("密码").fill("column admin secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("administrator can rename a topic without breaking its stable link", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // 找到 ANOVA 主题改名
  const renameInput = page.getByLabel("重命名主题 ANOVA");
  await renameInput.fill("ANOVA 方差分析");
  await renameInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();

  await expect(page).toHaveURL(/manage\/columns/);
  await expect(page.getByRole("status")).toContainText("主题已改名");
  await expect(page.getByText("ANOVA 方差分析")).toBeVisible();

  // 改名不破坏旧链接（IA-03）：知识入口的 ?topic=anova 仍有效
  await page.goto("/quality?topic=anova");
  await expect(
    page.getByRole("heading", { name: "ANOVA 方差分析" }),
  ).toBeVisible();

  // 还原主题名，避免污染后续依赖 "ANOVA" 名称的 e2e（知识入口、阅读路径等）
  await page.goto("/manage/columns");
  const renameBack = page.getByLabel("重命名主题 ANOVA 方差分析");
  await renameBack.fill("ANOVA");
  await renameBack
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("主题已改名");
});

test("administrator sees empty topics in the admin view (IA-08)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");
  // MSA 主题在种子中无已发布文章，但管理后台可见
  await expect(page.getByText("MSA")).toBeVisible();
});

test("archiving a topic with published articles is refused (IA-09)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // SPC 有已发布文章（seed spc-basics），归档应被拒绝；
  // 用 SPC 而非 ANOVA，避免与改名测试的持久修改相互干扰。
  const renameInput = page.getByLabel("重命名主题 SPC");
  const row = renameInput.locator(
    "xpath=ancestor::div[.//button[text()='归档']][1]",
  );
  await row.getByRole("button", { name: "归档" }).click();
  await expect(
    page.getByText("该主题仍有已发布文章，请先迁移到其他主题再归档。"),
  ).toBeVisible();
  await expect(page.getByLabel("重命名主题 SPC")).toBeVisible();
});

test("reader cannot access column management", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/manage/columns");
  // 阅读者被重定向离开管理页
  await expect(page).not.toHaveURL(/\/manage\/columns$/);
});

test("administrator can reorder topics (IA-07)", async ({ page }) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // SPC 不被改名测试触碰；上移一次
  await page.getByLabel("移动主题 SPC 上移").click();
  await expect(page.getByRole("status")).toContainText("排序已调整");

  // 仍可通过稳定标识访问（IA-03 不受排序影响）
  await page.goto("/quality?topic=spc");
  await expect(page.getByRole("heading", { name: "SPC" })).toBeVisible();
});

test("management page shows due reviews and confirms still valid (GOV-02/03)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage");

  // 待复核区块包含 anova-intro（seed 中复核已到期）
  const reviews = page.getByLabel("待复核内容");
  await expect(reviews).toContainText("ANOVA 入门");

  // 确认仍然有效 → 区块更新
  await reviews.getByRole("button", { name: "确认仍然有效" }).click();
  await expect(page.getByRole("status")).toContainText("内容复核已更新");
});
