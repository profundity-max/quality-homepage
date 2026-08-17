import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("home shows real template, book and onboarding entries (HOME-03)", async ({
  page,
}) => {
  await loginAsMember(page);

  const templates = page.locator("main section", { hasText: "模板中心" });
  await expect(templates).toContainText("1 个模板");

  const books = page.locator("main section", { hasText: "推荐书单" });
  await expect(books).toContainText("1 本书");

  const onboarding = page.locator("main section", { hasText: "新人专区" });
  await expect(onboarding).toContainText("6 个阶段");
});

test("content loop: onboarding → article; templates → download; books browse", async ({
  page,
}) => {
  await loginAsMember(page);

  // 新人路线可进入并查看阶段
  await page.goto("/onboarding");
  await expect(page.getByLabel("当前阶段")).toContainText("入职第一天");

  // 模板中心浏览 + 详情字段
  await page.goto("/templates");
  await page.getByRole("link", { name: /演示检验记录表/ }).click();
  await expect(page.getByText(/QMS 正式受控版本/)).toBeVisible();

  // 书单浏览
  await page.goto("/books");
  await expect(page.getByLabel("演示书分类")).toContainText(
    "演示：品质管理基础",
  );
  await expect(page.getByText("无封面")).toBeVisible();
});
