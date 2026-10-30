import { expect, test } from "@playwright/test";

test("editorial homepage preserves navigation, keyboard search and responsive assets", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("member secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page
      .getByRole("navigation", { name: "主导航", exact: true })
      .getByRole("link"),
  ).toHaveText([
    "首页",
    "新人专区",
    "品质知识",
    "散热知识",
    "推荐书单",
    "模板中心",
    "应用中心",
  ]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("搜索知识").fill("ANOVA");
  await expect(dialog.getByRole("link", { name: /ANOVA 入门/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await expect(
    page.getByAltText("同均值、不同标准差的正态分布示意图"),
  ).toHaveAttribute("src", /process-distribution-dark/);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByLabel("打开主导航").click();
  await expect(
    page
      .getByRole("navigation", { name: "移动端主导航链接" })
      .getByRole("link", { name: "模板中心" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "搜索知识", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "移动端主导航链接" }),
  ).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "搜索知识", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
