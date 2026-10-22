import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

for (const account of [
  ["editor", "editor secure password"],
  ["member", "member secure password"],
]) {
  test(`${account[0]} cannot access learning statistics or exports`, async ({
    page,
  }) => {
    await login(page, account[0], account[1]);
    await page.goto("/manage/stats");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/manage");
    await expect(
      page.getByRole("link", { name: "学习统计", exact: true }),
    ).toHaveCount(0);
    const response = await page.request.get("/api/stats/people-export");
    expect(response.status()).toBe(403);
  });
}

test("administrator can explore overview, people, content and filtered details", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage");
  await page.getByRole("link", { name: "学习统计", exact: true }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "学习统计" }),
  ).toBeVisible();
  await expect(
    page.getByText("实名学习记录保留两年", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "每日参与趋势" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "人员", exact: true }).click();
  await expect(page).toHaveURL(/view=people/);
  await expect(
    page.getByRole("columnheader", { name: "有效阅读篇数", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "当前收藏数", exact: true }),
  ).toBeVisible();
  await page.getByLabel("统计周期").selectOption("custom");
  await page.getByLabel("开始日期").fill("2026-01-01");
  await page.getByLabel("结束日期").fill("2026-12-31");
  await page.getByLabel("姓名或用户名").fill("columnadmin");
  await page.getByLabel("人员排序").selectOption("logins");
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(page).toHaveURL(/q=columnadmin/);
  const exportLink = page.getByRole("link", { name: "导出人员汇总 Excel" });
  await expect(exportLink).toHaveAttribute(
    "href",
    /people-export\?.*period=custom.*from=2026-01-01.*q=columnadmin/,
  );
  await page
    .getByRole("region", { name: "人员统计", exact: true })
    .getByRole("link")
    .first()
    .click();
  await expect(page).toHaveURL(/userId=[0-9a-f-]+/);
  await expect(page).toHaveURL(/q=columnadmin/);
  await expect(page.getByLabel("人员排序")).toHaveValue("logins");
  await page.getByRole("link", { name: "内容", exact: true }).click();
  await expect(page).toHaveURL(/q=columnadmin/);
  await expect(
    page.getByRole("heading", { name: "文章统计", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "模板统计", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "阅读明细", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "下载明细", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "模板版本", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "登录明细", exact: true }),
  ).toBeVisible();
});

test("preset periods accept form dates and retain name and sorting filters", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/stats?view=people");
  await page.getByLabel("姓名或用户名").fill("columnadmin");
  await page.getByLabel("人员排序").selectOption("logins");
  for (const period of ["month", "quarter", "year"]) {
    await page.getByLabel("统计周期").selectOption(period);
    await page.getByRole("button", { name: "应用筛选", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "学习统计" }),
    ).toBeVisible();
    await expect(page.getByLabel("姓名或用户名")).toHaveValue("columnadmin");
    await expect(page.getByLabel("人员排序")).toHaveValue("logins");
    const href = await page
      .getByRole("link", { name: "导出人员汇总 Excel" })
      .getAttribute("href");
    expect(href).toContain(`period=${period}`);
    expect(href).not.toContain("from=");
    expect(href).not.toContain("to=");
  }
});

test("invalid custom date ranges show a repairable filter instead of a server error", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  for (const dates of [
    "from=2026-01-01",
    "from=bad&to=2026-01-01",
    "from=2026-02-30&to=2026-03-01",
    "from=2026-10-10&to=2026-10-01",
    "from=2020-01-01&to=2026-01-01",
  ]) {
    const response = await page.goto(`/manage/stats?period=custom&${dates}`);
    expect(response?.status()).toBe(200);
    await expect(
      page.getByRole("alert").filter({ hasText: "日期筛选未应用" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "应用筛选", exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("统计周期")).toHaveValue("custom");
  }
  await page.getByLabel("开始日期").fill("2026-01-01");
  await page.getByLabel("结束日期").fill("2026-12-31");
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "每日参与趋势" }),
  ).toBeVisible();
});
