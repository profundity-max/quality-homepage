import { expect, test } from "@playwright/test";

test("administrator can download a backup and run an isolated restore drill", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/change-password/);
  await page.getByLabel("当前密码").fill("correct horse battery staple");
  await page
    .getByLabel("新密码", { exact: true })
    .fill("compose admin secure password");
  await page.getByLabel("确认新密码").fill("compose admin secure password");
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage/backups");

  await page.getByRole("button", { name: "立即执行手动备份" }).click();
  await expect(page.getByRole("status")).toContainText("备份完成");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载备份文件" }).first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^backup-.*-manual\.bin$/);

  await page.getByRole("button", { name: "恢复演练" }).first().click();
  await expect(page.getByRole("status")).toContainText("隔离恢复演练通过");
});
