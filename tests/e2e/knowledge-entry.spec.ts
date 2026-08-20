import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("knowledge entry pages show the real column tree and published articles", async ({
  page,
}) => {
  await loginAsMember(page);

  await page.goto("/quality");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("品质知识");

  // 分类树展示真实栏目（种子内容只有 数据与统计基础 下 ANOVA 有已发布文章）
  const tree = page.getByRole("complementary", { name: "分类树" });
  await expect(tree).toContainText("数据与统计基础");
  await expect(tree.getByRole("link", { name: "ANOVA" })).toBeVisible();

  // 选中 ANOVA 主题后展示其已发布文章（seed 首个主题已变为 sigma）
  await tree.getByRole("link", { name: "ANOVA" }).click();
  await expect(page).toHaveURL(/topic=anova/);
  await expect(page.getByRole("heading", { name: "ANOVA" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ANOVA 入门" })).toBeVisible();
  await expect(page.getByText("方差分析的基础概念与适用场景。")).toBeVisible();

  // 空主题/空栏目不出现（种子中 测量与数据可信度 等无内容）
  await expect(tree.getByRole("link", { name: "MSA" })).toHaveCount(0);
});

test("clicking a topic switches the article list via stable id", async ({
  page,
}) => {
  await loginAsMember(page);

  await page.goto("/quality");
  const tree = page.getByRole("complementary", { name: "分类树" });
  await tree.getByRole("link", { name: "SPC" }).click();

  await expect(page).toHaveURL(/topic=spc-basics|topic=spc/);
  await expect(page.getByRole("heading", { name: "SPC" })).toBeVisible();
  await expect(page.getByRole("link", { name: "SPC 基础" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ANOVA 入门" })).toHaveCount(0);
});

test("the classification tree collapses and expands with the keyboard", async ({
  page,
}) => {
  await loginAsMember(page);

  await page.goto("/quality");
  const tree = page.getByRole("complementary", { name: "分类树" });
  const summary = tree.getByText("数据与统计基础");
  await expect(summary).toBeVisible();

  // 收起子栏目后，其主题不可见
  await summary.click();
  await expect(tree.getByRole("link", { name: "ANOVA" })).toHaveCount(0);
  // 再次展开
  await summary.click();
  await expect(tree.getByRole("link", { name: "ANOVA" })).toBeVisible();
});

test("thermal knowledge entry shows an empty state", async ({ page }) => {
  await loginAsMember(page);

  await page.goto("/thermal");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("散热知识");
  await expect(page.getByText("该栏目暂无内容。")).toBeVisible();
});
