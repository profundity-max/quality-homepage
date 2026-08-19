import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("editor sees aggregate dashboard and the STAT-10 declaration, not identity detail (STAT-05/06/10)", async ({
  page,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/stats");
  await expect(
    page.getByRole("heading", { level: 1, name: "内容统计" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "内容统计用于知识建设，不表示学习成效，不作为个人绩效或培训完成证明。",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "热门文章（累计阅读）" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "无结果搜索词（知识缺口）" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /导出不含身份的聚合统计 CSV/ }),
  ).toBeVisible();
  await expect(
    page.getByText("身份化搜索明细", { exact: false }),
  ).not.toBeVisible();
});

test("reader cannot open the statistics dashboard (STAT-05)", async ({
  page,
}) => {
  await login(page, "member", "member secure password");
  await page.goto("/manage/stats");
  await expect(page).not.toHaveURL(/\/manage\/stats$/);
});

test("administrator sees 90-day identity detail and compliance cleanup (STAT-06/08/11)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/stats");
  await expect(
    page.getByRole("heading", {
      name: "身份化搜索明细（最近 90 天 · 仅管理员）",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "身份化触达明细（最近 90 天 · 仅管理员）",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "执行合规数据清理（90 天前明细）" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "不提供触达人员名单导出；身份化明细仅管理员可见且保留 90 天。",
    ),
  ).toBeVisible();
});
