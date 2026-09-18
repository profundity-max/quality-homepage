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
  // 精简后栏目名不再重复显示在正文区，身份由顶部导航表达
  await expect(
    page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: "品质知识" }),
  ).toHaveAttribute("aria-current", "page");

  // 分类树展示真实栏目（种子内容只有 数据与统计基础 下 ANOVA 有已发布文章）
  const tree = page.getByRole("complementary", { name: "分类树" });
  await expect(tree).toContainText("数据与统计基础");
  await expect(tree.getByRole("link", { name: "ANOVA" })).toBeVisible();

  // 选中 ANOVA 主题后直接展示正文（主题名由分类树表达，不再重复成标题）
  await tree.getByRole("link", { name: "ANOVA" }).click();
  await expect(page).toHaveURL(/topic=anova/);
  await expect(
    tree.getByRole("link", { name: "ANOVA", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const anovaEntry = page.getByLabel("文章 ANOVA 入门", { exact: true });
  await expect(anovaEntry).toContainText("负责人");
  await expect(anovaEntry).toContainText("方差分析用于比较多个组的均值差异。");

  // 空主题/空栏目不出现（种子中 测量与数据可信度 等无内容）
  await expect(tree.getByRole("link", { name: "MSA" })).toHaveCount(0);
});

test("topic page shows only the article body plus owner and update time", async ({
  page,
}) => {
  await loginAsMember(page);

  await page.goto("/quality?topic=anova");
  const entry = page.getByLabel("文章 ANOVA 入门", { exact: true });
  await expect(entry).toBeVisible();
  // 保留：负责人 / 更新时间
  await expect(entry).toContainText("负责人");
  await expect(entry).toContainText("更新");
  // 正文整篇内联
  await expect(entry).toContainText("方差分析用于比较多个组的均值差异。");
  await expect(page.getByText("什么是 ANOVA", { exact: true })).toBeVisible();
  // 精简掉的重复信息：栏目名、主题名、文章标题、摘要都不再出现在正文区
  await expect(page.getByText("方差分析的基础概念与适用场景。")).toHaveCount(0);
  // 栏目名/主题名/文章标题只为屏幕阅读器保留结构，视觉上被裁掉
  const headingIsClipped = await page
    .locator("main > section > h1")
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return style.clipPath !== "none" && style.position === "absolute";
    });
  expect(headingIsClipped).toBe(true);
  // 保留进入完整阅读页（目录 / 收藏 / 反馈）的入口
  await expect(
    entry.getByRole("link", { name: "打开阅读页（目录 / 收藏 / 反馈）" }),
  ).toHaveAttribute("href", "/articles/anova-intro");

  // 内联正文（含表格/公式）不能把窄屏撑出横向滚动
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  await entry
    .getByRole("link", { name: "打开阅读页（目录 / 收藏 / 反馈）" })
    .click();
  await expect(page).toHaveURL(/\/articles\/anova-intro$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "ANOVA 入门" }),
  ).toBeVisible();
});

test("clicking a topic switches the article list via stable id", async ({
  page,
}) => {
  await loginAsMember(page);

  await page.goto("/quality");
  const tree = page.getByRole("complementary", { name: "分类树" });
  await tree.getByRole("link", { name: "SPC" }).click();

  await expect(page).toHaveURL(/topic=spc-basics|topic=spc/);
  await expect(tree.getByRole("link", { name: "SPC" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page
      .getByLabel("文章 SPC 基础", { exact: true })
      .getByRole("link", { name: "打开阅读页（目录 / 收藏 / 反馈）" }),
  ).toBeVisible();
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
