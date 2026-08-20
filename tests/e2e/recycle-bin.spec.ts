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

test("reader cannot open the recycle bin (DEL-02)", async ({ page }) => {
  await login(page, "member", "member secure password");
  await page.goto("/manage/recycle-bin");
  await expect(page).not.toHaveURL(/\/manage\/recycle-bin$/);
});
