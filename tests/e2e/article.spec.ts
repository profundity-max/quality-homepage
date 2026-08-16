import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function loginAsEditor(page: import("@playwright/test").Page) {
  // 若已有会话（例如同测试先以 member 登录），先退出
  const logout = page.getByRole("button", { name: "退出登录" });
  if (await logout.count()) {
    await logout.click();
    await expect(page).toHaveURL(/\/login/);
  }
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("article page renders all section-8 elements in order", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/articles/anova-intro");

  // 面包屑与主题
  await expect(page.getByLabel("面包屑")).toContainText("数据与统计基础");
  await expect(page.getByLabel("面包屑")).toContainText("ANOVA");

  // 标题与摘要
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门",
  );
  await expect(page.getByText("方差分析的基础概念与适用场景。")).toBeVisible();

  // 负责人、更新时间、复核日期、阅读次数
  await expect(page.getByLabel("文章信息")).toContainText("品质管理员");
  await expect(page.getByLabel("文章信息")).toContainText("阅读次数");

  // 正文目录 + Markdown 正文（含 Callout 渲染）
  const toc = page.getByRole("complementary", { name: "正文目录" });
  await expect(toc).toContainText("什么是 ANOVA");
  await expect(toc.getByRole("link", { name: "什么是 ANOVA" })).toBeVisible();
  await expect(page.locator("article h2")).toContainText("什么是 ANOVA");
  await expect(page.locator("article .callout-important")).toBeVisible();

  // 标签与相关文章
  await expect(page.getByLabel("标签")).toContainText("统计");
  // 相关文章：同主题优先 → ANOVA 实例
  await expect(page.getByLabel("相关文章")).toContainText("ANOVA 实例");

  // 收藏/反馈入口不出现
  await expect(page.getByText("收藏", { exact: true })).toHaveCount(0);
  await expect(page.getByText("内容反馈", { exact: true })).toHaveCount(0);

  // 版本历史仅编辑者/管理员 → 阅读者不可见
  await expect(page.getByRole("link", { name: "版本历史" })).toHaveCount(0);
});

test("version history entry is visible to editors only", async ({ page }) => {
  // 阅读者（member）不可见
  await loginAsMember(page);
  await page.goto("/articles/anova-intro");
  await expect(page.getByRole("link", { name: "版本历史" })).toHaveCount(0);

  // 编辑者可见（ART-07）
  await loginAsEditor(page);
  await page.goto("/articles/anova-intro");
  await expect(page.getByRole("link", { name: "版本历史" })).toBeVisible();
});

test("adjacent navigation works within the same topic", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/articles/anova-intro");
  const nav = page.getByLabel("上下篇导航");
  // anova-intro（较早）的下一篇是同主题的 anova-example
  await expect(nav.getByRole("link", { name: "ANOVA 实例" })).toBeVisible();

  await page.goto("/articles/anova-example");
  // anova-example（较新）的上一篇是 anova-intro
  await expect(nav.getByRole("link", { name: "ANOVA 入门" })).toBeVisible();
});

test("reading path survives 390px width and 200% zoom", async ({ page }) => {
  await loginAsMember(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/articles/anova-intro");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门",
  );
  await expect(page.getByLabel("面包屑")).toBeVisible();
  await expect(page.locator("article .callout-important")).toBeVisible();

  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("draft and archived articles are not reachable", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/articles/does-not-exist");
  await expect(page.getByText("404")).toBeVisible();
});
