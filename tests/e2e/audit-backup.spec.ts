import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("administrator sees audit logs and can trigger a manual encrypted backup (AUDIT-03/BKP-05)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");

  await page.goto("/manage/audit");
  await expect(
    page.getByRole("heading", { level: 1, name: "审计日志" }),
  ).toBeVisible();
  await expect(
    page.getByText("内容审计（最近", { exact: false }),
  ).toBeVisible();

  await page.goto("/manage/backups");
  await expect(
    page.getByRole("heading", { level: 1, name: "备份与恢复" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "立即执行手动备份" }).click();
  await expect(page.getByRole("status")).toContainText("备份完成");
  await expect(page.getByText("手动", { exact: true }).first()).toBeVisible();
});

test("readers cannot open audit or backup management (SEC/roles)", async ({
  page,
}) => {
  await login(page, "member", "member secure password");
  await page.goto("/manage/audit");
  await expect(page).not.toHaveURL(/\/manage\/audit$/);
  await page.goto("/manage/backups");
  await expect(page).not.toHaveURL(/\/manage\/backups$/);
});
