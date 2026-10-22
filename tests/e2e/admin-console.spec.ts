import { expect, test } from "@playwright/test";

test("account console filters, opens forms on demand and restores keyboard focus", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("columnadmin");
  await page.getByLabel("密码").fill("column admin secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const create = page.getByRole("button", { name: "新建账号" });
  await create.click();
  await expect(page.getByRole("dialog", { name: "创建账号" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(create).toBeFocused();
  await page.getByLabel("姓名或账号").fill("columnadmin");
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("@columnadmin");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "编辑账号 · columnadmin",
  );
  await page.keyboard.press("Escape");
  await page.getByLabel("姓名或账号").fill("no-such-account");
  await page.getByRole("button", { name: "应用筛选", exact: true }).click();
  await expect(page.getByText("没有符合条件的账号。")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manage");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByText("后台导航", { exact: true }).click();
  await page.getByRole("link", { name: "学习统计", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "学习统计", level: 1 }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
