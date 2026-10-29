import { expect, test, type Page } from "@playwright/test";
async function loginAsMember(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("member secure password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
test("home shows selected feature, real knowledge entries and recent updates", async ({
  page,
}) => {
  await loginAsMember(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "从数据可信，到过程受控",
  );
  await expect(
    page.getByRole("navigation", { name: "知识分类" }),
  ).toContainText("数据与统计基础");
  await expect(
    page.getByRole("complementary", { name: "常用入口" }),
  ).toContainText("暂无内容");
  const updates = page.getByRole("region", { name: "最近更新" });
  await expect(updates).toContainText("ANOVA 实例");
  await expect(updates).toContainText("ANOVA 入门");
  await expect(
    updates.getByRole("link").filter({ hasNotText: "查看更多" }),
  ).toHaveCount(5);
});
test("recent updates link to the reading page", async ({ page }) => {
  await loginAsMember(page);
  const first = page
    .getByRole("region", { name: "最近更新" })
    .getByRole("link")
    .filter({ hasNotText: "查看更多" })
    .first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page).toHaveURL(href!);
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
});
test("knowledge entry links from home reach the entry pages", async ({
  page,
}) => {
  await loginAsMember(page);
  await page
    .getByTestId("home-hero")
    .getByRole("link", { name: "探索品质知识" })
    .click();
  await expect(page).toHaveURL(/\/quality$/);
  await expect(page.getByRole("main")).toContainText("品质知识");
});
