import { expect, test } from "@playwright/test";

async function loginAsEditor(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("editor switches between preview, source and split modes", async ({
  page,
}) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/anova-intro/edit");

  // 默认即时预览
  const tabs = page.getByRole("tablist", { name: "编辑模式" });
  await expect(tabs.getByRole("tab", { name: "即时预览" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // 切到源码
  await tabs.getByRole("tab", { name: "源码" }).click();
  await expect(page.getByLabel("Markdown 源码")).toBeVisible();

  // 切到分栏：源码 + 预览并存
  await tabs.getByRole("tab", { name: "分栏" }).click();
  await expect(page.getByLabel("Markdown 源码")).toBeVisible();
  await expect(page.getByLabel("预览")).toBeVisible();
});

test("toolbar command wraps selection and command menu opens", async ({
  page,
}) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/anova-intro/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  await source.fill("测试文本");
  await source.selectText();
  await page.getByRole("button", { name: "加粗" }).click();
  await expect(source).toHaveValue("**测试文本**");

  // 命令菜单
  await page.getByRole("button", { name: "命令菜单" }).click();
  await expect(
    page.getByRole("button", { name: "警告 Callout" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "警告 Callout" }).click();
  await expect(source).toHaveValue("> [!warning] **测试文本**");
});

test("editor outline and properties panels open", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/anova-intro/edit");

  await page.getByRole("button", { name: "大纲" }).click();
  await expect(page.getByLabel("文章大纲")).toContainText("什么是 ANOVA");

  await page.getByRole("button", { name: "属性" }).click();
  await expect(page.getByLabel("文章属性")).toContainText("标题");
  await expect(page.getByLabel("文章属性")).toContainText("下次复核日期");
});

test("editor works at 390px", async ({ page }) => {
  await loginAsEditor(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manage/articles/anova-intro/edit");

  await expect(page.getByRole("tablist", { name: "编辑模式" })).toBeVisible();
  await page.getByRole("button", { name: "命令菜单" }).click();
  await expect(
    page.getByRole("button", { name: "重点 Callout" }),
  ).toBeVisible();
});
