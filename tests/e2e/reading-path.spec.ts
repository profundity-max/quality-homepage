import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("full reading path: home → entry → tree → topic → article → recent updates", async ({
  page,
}) => {
  await loginAsMember(page);

  // 首页 → 品质知识入口
  await page
    .locator("main section", { hasText: "品质知识" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/quality$/);

  // 分类树 → 主题（ANOVA）
  const tree = page.getByRole("complementary", { name: "分类树" });
  await tree.getByRole("link", { name: "ANOVA" }).click();
  await expect(page).toHaveURL(/topic=anova/);

  // 主题 → 文章
  await page.getByRole("link", { name: "ANOVA 实例" }).click();
  await expect(page).toHaveURL(/\/articles\/anova-example$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 实例",
  );

  // 回首页 → 最近更新可跳转
  await page.goto("/");
  const updates = page.getByRole("region", { name: "最近更新" });
  await expect(updates.getByRole("link").first()).toContainText("ANOVA 实例");
  await updates.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/articles\/anova-example$/);
});

test("demo article renders tables, formulas, code blocks and internal links", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/articles/anova-example");

  // 表格
  const table = page.locator("article table");
  await expect(table).toBeVisible();
  await expect(table).toContainText("组别");
  await expect(table).toContainText("12.4");

  // 公式（KaTeX）
  await expect(page.locator("article .katex")).toHaveCount(2);

  // 代码块
  await expect(page.locator("article pre code")).toContainText(
    "betweenGroupsSsq",
  );

  // 站内链接（Callout 内引用入门篇）——限定在正文内，避开相关文章区块
  const internalLink = page.locator("article").getByRole("link", {
    name: "ANOVA 入门",
    exact: true,
  });
  await expect(internalLink).toBeVisible();
  await internalLink.click();
  await expect(page).toHaveURL(/\/articles\/anova-intro$/);
});

test("demo article callouts keep their body content (multi-paragraph)", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/articles/anova-intro");

  const callout = page.locator("article .callout-important");
  await expect(callout).toBeVisible();
  await expect(callout).toContainText("前提");
  await expect(callout).toContainText("数据应近似正态且方差齐性");
});

test("full reading path survives 390px width (common definition)", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // 首页入口在窄屏可用
  await page
    .locator("main section", { hasText: "品质知识" })
    .getByRole("link")
    .click();
  await expect(page).toHaveURL(/\/quality$/);
  // 分类树与文章列表在窄屏堆叠可用
  await expect(page.getByRole("heading", { name: "品质知识" })).toBeVisible();
  await page.getByRole("link", { name: "ANOVA 入门" }).click();
  await expect(page).toHaveURL(/\/articles\/anova-intro$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门",
  );
  // 无横向滚动
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("spc demo article is readable via the entry page", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/quality?topic=spc");
  await expect(page.getByRole("heading", { name: "SPC" })).toBeVisible();
  await page.getByRole("link", { name: "SPC 基础" }).click();
  await expect(page).toHaveURL(/\/articles\/spc-basics$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("SPC 基础");
  await expect(page.locator("article h2")).toContainText("控制图");
});
