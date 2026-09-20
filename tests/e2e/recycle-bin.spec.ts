import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("editor archives an article; admin restores it from the recycle bin (DEL-01/02)", async ({
  page,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/articles/anova-intro/versions");
  await page.getByLabel("归档原因").fill("内容迁移到新主题");
  await page.getByRole("button", { name: "归档文章" }).click();
  await expect(page.getByRole("status")).toContainText("文章已归档");

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/recycle-bin?type=article");
  await expect(
    page.getByRole("heading", { level: 1, name: "回收站" }),
  ).toBeVisible();
  await expect(page.getByText(/ANOVA/).first()).toBeVisible();
  await expect(page.getByText("归档于")).toBeVisible();
  // 刚归档未满 30 天：永久删除禁用并显示剩余保留期
  await expect(page.getByRole("button", { name: "永久删除" })).toBeDisabled();
  await expect(page.getByText(/剩余保留期/)).toBeVisible();

  await page.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByRole("status")).toContainText("已恢复");
  await expect(page.getByText("回收站暂无文章。")).toBeVisible();
});

test("admin can immediately purge a never-published draft with a reason (DEL-02)", async ({
  page,
}) => {
  // 编辑者：新建一篇从未发布过的草稿并从列表归档
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/articles/new");
  await page.getByRole("tab", { name: "源码", exact: true }).click();
  await page
    .getByLabel("Markdown 源码")
    .fill("## 临时内容\n\n这是一篇不会再发布的自测草稿。");
  await page.getByRole("button", { name: "属性", exact: true }).click();
  const properties = page.getByLabel("文章属性");
  await properties
    .getByLabel("标题", { exact: true })
    .fill("回收站立即清理验证");
  await properties
    .getByLabel("摘要", { exact: true })
    .fill("从未发布过的测试草稿");
  await properties.getByLabel("主题").selectOption({ label: "ANOVA" });
  await properties.getByLabel("内容负责人").selectOption({ label: "品质编辑" });
  await properties.getByLabel("下次复核日期").fill("2027-06-30");
  await properties
    .getByRole("button", { name: "保存草稿", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(/草稿已(创建|保存)/);

  await page.goto("/manage/articles");
  const row = page
    .getByText("回收站立即清理验证")
    .locator("xpath=ancestor::li");
  await row.getByLabel("归档文章 回收站立即清理验证 的原因").fill("测试内容");
  await row.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已归档。");

  // 管理员：从未发布过的草稿可立即永久删除，但必须填原因
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/recycle-bin?type=article");
  const card = page
    .getByText("回收站立即清理验证")
    .locator("xpath=ancestor::li");
  await expect(card).toContainText("从未发布过的草稿，可立即永久删除");
  await expect(
    card.getByLabel("永久删除 回收站立即清理验证 的原因"),
  ).toHaveAttribute("required", "");
  await card
    .getByLabel("永久删除 回收站立即清理验证 的原因")
    .fill("测试内容清理");
  await card.getByRole("button", { name: "永久删除" }).click();
  await expect(page.getByRole("status")).toContainText("已永久删除。");
  await expect(page.getByText("回收站立即清理验证")).toHaveCount(0);

  // 彻底清除：管理列表与阅读页都不再有这篇
  await page.goto("/manage/articles?status=archived");
  await expect(page.getByText("回收站立即清理验证")).toHaveCount(0);
});

test("reader cannot open the recycle bin (DEL-02)", async ({ page }) => {
  await login(page, "member", "member secure password");
  await page.goto("/manage/recycle-bin");
  await expect(page).not.toHaveURL(/\/manage\/recycle-bin$/);
});
