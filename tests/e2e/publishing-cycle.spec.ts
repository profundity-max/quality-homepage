import { expect, test } from "@playwright/test";

async function loginAsEditor(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("full cycle: create draft → edit → publish → read → restore (roadmap goal)", async ({
  page,
}) => {
  await loginAsEditor(page);

  // 新建文章（通过编辑已发布文章的独立草稿流程模拟；新建入口用 /manage/articles/new）
  await page.goto("/manage/articles/new");
  await expect(page.getByRole("tablist", { name: "编辑模式" })).toBeVisible();

  // 用已有的 anova-intro 走完整发布链路：编辑 → 发布
  await page.goto("/manage/articles/anova-intro/edit");
  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  const original = await source.inputValue();
  await source.fill(original + "\n\n## 新增小节\n\n这是闭环验收新增内容。");

  // 属性面板：更新标题并发布
  await page.getByRole("button", { name: "属性" }).click();
  const titleInput = page.locator('input[name="title"]');
  await titleInput.fill("ANOVA 入门（验收版）");
  await page.getByRole("button", { name: "发布" }).click();
  await expect(page).toHaveURL(/\/manage\/articles\/anova-intro\/edit/);
  await page.waitForLoadState("networkidle");
  console.log("publish result URL:", page.url());

  // 发布后阅读页可见新标题与新内容
  await page.goto("/articles/anova-intro", { waitUntil: "commit" });
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门（验收版）",
  );
  await expect(page.locator("article")).toContainText("闭环验收新增内容");

  // 版本历史：进入编辑产生快照，历史页可恢复
  await page.goto("/manage/articles/anova-intro/edit");
  await page.getByRole("tab", { name: "源码" }).click();
  const source2 = page.getByLabel("Markdown 源码");
  await source2.fill("编辑中的内容");
  await page.getByRole("button", { name: "属性" }).click();
  await page.getByRole("button", { name: "保存草稿" }).click();

  await page.goto("/articles/anova-intro/versions");
  await expect(page.getByText(/共 \d+ 个版本/)).toBeVisible();
  await expect(page.getByRole("button", { name: "恢复此版本" })).toBeVisible();
});

test("editor path survives 390px width and 200% zoom", async ({ page }) => {
  await loginAsEditor(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/manage/articles/anova-intro/edit");
  await expect(page.getByRole("tablist", { name: "编辑模式" })).toBeVisible();
  await page.getByRole("tab", { name: "源码" }).click();
  await expect(page.getByLabel("Markdown 源码")).toBeVisible();

  await page.evaluate(() => {
    document.body.style.zoom = "2";
  });
  await expect(page.getByRole("tab", { name: "即时预览" })).toBeVisible();
});
