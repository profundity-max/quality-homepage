import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("reader submits all five feedback types; editor resolves them (FDBK-01/02/03)", async ({
  page,
}) => {
  await login(page, "member", "member secure password");

  for (const [type, description] of [
    ["内容错误", "公式符号有误"],
    ["内容过期", "流程已更新"],
    ["表述不清", "示例看不明白"],
    ["缺少相关内容", "希望补充案例"],
    ["其他", "建议调整目录"],
  ] as const) {
    await page.goto("/articles/anova-intro");
    await page.getByText("内容反馈").click();
    await page.getByRole("radio", { name: type }).check();
    await page.getByLabel("说明").fill(description);
    await page.getByRole("button", { name: "提交反馈" }).click();
    await expect(page.getByText("反馈已提交，感谢你的补充。")).toBeVisible();
  }

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/feedback?status=pending");
  await expect(page.getByText("公式符号有误")).toBeVisible();

  const firstCard = page.locator("li", { hasText: "公式符号有误" }).first();
  await firstCard
    .getByLabel(/处理说明（ANOVA 入门）/)
    .first()
    .fill("已修正公式");
  await firstCard.getByRole("button", { name: "标记已解决" }).first().click();
  await expect(page.getByRole("status")).toContainText("反馈已处理。");
  await page.goto("/manage/feedback?status=resolved");
  await expect(page.getByText("已修正公式")).toBeVisible();
});

test("readers cannot open feedback processing (FDBK-03)", async ({ page }) => {
  await login(page, "member", "member secure password");
  await page.goto("/manage/feedback");
  await expect(page).not.toHaveURL(/\/manage\/feedback$/);
});
