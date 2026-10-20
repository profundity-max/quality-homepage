import { expect, test } from "@playwright/test";

test("choosing the server version restores all article properties across same-account tabs", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage/articles/new");
  await page.getByRole("tab", { name: "源码" }).click();
  await page.getByLabel("Markdown 源码").fill("Original body");
  await page
    .getByLabel("标题", { exact: true })
    .fill("Original conflict title");
  await page.getByLabel("摘要").fill("Original summary");
  await page.getByLabel("主题").selectOption({ label: "ANOVA" });
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page).toHaveURL(/\/manage\/articles\/article-[^/]+\/edit/);
  const editorUrl = new URL(page.url());
  editorUrl.search = "";
  const oldTab = await context.newPage();
  await oldTab.clock.install();
  await oldTab.goto(editorUrl.href);
  await oldTab.getByRole("tab", { name: "源码" }).click();
  await page.getByLabel("标题", { exact: true }).fill("New server title");
  await page.getByLabel("摘要").fill("New server summary");
  await page.getByLabel("标签（逗号分隔）").fill("server-tag");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "草稿已保存。" }),
  ).toBeVisible();
  await oldTab.getByLabel("Markdown 源码").fill("Unsaved old-tab body");
  await oldTab.clock.fastForward(31_000);
  await expect(oldTab.getByRole("dialog", { name: "版本冲突" })).toBeVisible();
  await oldTab.getByRole("button", { name: "保留服务器版本" }).click();
  await expect(oldTab.getByLabel("标题", { exact: true })).toHaveValue(
    "New server title",
  );
  await expect(oldTab.getByLabel("摘要")).toHaveValue("New server summary");
  await expect(oldTab.getByLabel("标签（逗号分隔）")).toHaveValue("server-tag");
  await oldTab.getByRole("button", { name: "保存草稿" }).click();
  await expect(
    oldTab.getByRole("status").filter({ hasText: "草稿已保存。" }),
  ).toBeVisible();
  await oldTab.reload();
  await expect(oldTab.getByLabel("标题", { exact: true })).toHaveValue(
    "New server title",
  );
  await oldTab.close();
});
