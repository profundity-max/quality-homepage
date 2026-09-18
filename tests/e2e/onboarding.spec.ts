import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("onboarding lists articles and provides route-specific reading navigation", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/onboarding");
  const overview = page.getByLabel("新人路线总览");
  await expect(
    overview.getByRole("heading", { name: "学习路线 · 6 篇文章" }),
  ).toBeVisible();
  await overview.getByRole("link", { name: "入职第一天", exact: true }).click();
  const navigation = page.getByLabel("新人路线阅读导航");
  await expect(navigation).toContainText("第 1 步 / 共 6 步");
  await navigation.getByRole("link", { name: "下一篇：认识品质工作" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "认识品质工作" }),
  ).toBeVisible();
  await expect(navigation).toContainText("第 2 步 / 共 6 步");
  await expect(page.getByLabel("上下篇导航", { exact: true })).toHaveCount(0);
  await navigation.getByRole("link", { name: "返回路线总览" }).click();
  await expect(overview).toBeVisible();
});

test("legacy stage links preserve the four work principles", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/onboarding?stage=work-principles");
  await expect(page).toHaveURL(/\/articles\/onboarding-.+\?from=onboarding$/);
  const article = page.locator("article");
  for (const principle of [
    "Reality > Opinion",
    "Ownership > Explanation",
    "Early Exposure > Late Fix",
    "System > Hero",
  ]) {
    await expect(article).toContainText(principle);
  }
});

test("onboarding works at 390px without horizontal overflow", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");
  await page
    .getByLabel("新人路线总览")
    .getByRole("link", { name: "入职第一天", exact: true })
    .click();
  await expect(page.getByLabel("新人路线阅读导航")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
