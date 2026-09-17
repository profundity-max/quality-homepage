import { expect, test } from "@playwright/test";

async function loginAsEditor(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("editor maintains an article from the manage entry (list → new draft with alias → reopen)", async ({
  page,
}) => {
  await loginAsEditor(page);

  // 管理落地页 → 文章管理
  await page.goto("/manage");
  await page.getByRole("link", { name: "文章管理" }).click();
  await expect(page).toHaveURL(/\/manage\/articles$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "文章管理" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "新建文章" })).toBeVisible();
  await expect(page.getByText("ANOVA 入门")).toBeVisible();

  // 新建草稿
  await page.getByRole("link", { name: "新建文章" }).click();
  await expect(page).toHaveURL(/\/manage\/articles\/new$/);
  await page.getByRole("tab", { name: "源码" }).click();
  await page
    .getByLabel("Markdown 源码")
    .fill("## 编辑者维护测试\n\n这是通过文章管理入口创建的草稿。");

  await page.getByRole("button", { name: "属性" }).click();
  const properties = page.getByLabel("文章属性");
  await properties.getByLabel("标题").fill("编辑者维护测试文章");
  await properties.getByLabel("摘要").fill("通过文章管理入口创建的草稿");
  await properties.getByLabel("主题").selectOption({ label: "ANOVA" });
  await properties.getByLabel("标签（逗号分隔）").fill("测试, 编辑者");
  await properties.getByLabel(/知识别名/).fill("编辑别名, EditorAlias");
  await properties.getByLabel("内容负责人").selectOption({ label: "品质编辑" });
  await properties.getByLabel("下次复核日期").fill("2027-06-30");
  await properties.getByRole("button", { name: "保存草稿" }).click();

  await expect(page.getByRole("status")).toContainText(/草稿已(创建|保存)/);

  // 草稿出现在管理列表（状态筛选中可见）
  await page.goto("/manage/articles?status=draft");
  await expect(page.getByText("编辑者维护测试文章")).toBeVisible();

  // 重新打开：别名与负责人回填正确
  await page
    .getByText("编辑者维护测试文章")
    .locator("xpath=ancestor::li")
    .getByRole("link", { name: "编辑" })
    .click();
  await page.getByRole("button", { name: "属性" }).click();
  const aliasValue = await page.getByLabel(/知识别名/).inputValue();
  expect(aliasValue).toContain("编辑别名");
  expect(aliasValue).toContain("EditorAlias");
  await expect(page.getByLabel("内容负责人")).toHaveValue(/.+/);
});

test("reader cannot reach article management", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage/articles");
  await expect(page).not.toHaveURL(/\/manage\/articles$/);
});
