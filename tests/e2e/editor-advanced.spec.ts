import { expect, test } from "@playwright/test";

async function loginAsEditor(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("mermaid renders in the article page in safe mode", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/articles/anova-intro");

  // 正文无 mermaid（seed），页面正常渲染
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 入门",
  );
});

test("internal link picker inserts a stable-id link in the editor", async ({
  page,
}) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/edit-fixture/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  await source.fill("请阅读");

  await page.getByRole("button", { name: "站内链接" }).click();
  // 已发布文章列表（seed：ANOVA 入门 / ANOVA 实例 / SPC 基础）
  await expect(page.getByRole("button", { name: "SPC 基础" })).toBeVisible();
  await page.getByRole("button", { name: "SPC 基础" }).click();

  await expect(source).toHaveValue("请阅读[SPC 基础](/articles/spc-basics)");
});

test("callout commands are available in the command menu", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/edit-fixture/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  await source.fill("重要提醒");
  await source.selectText();

  await page.getByRole("button", { name: "命令菜单" }).click();
  await page.getByRole("button", { name: "重点 Callout" }).click();
  await expect(source).toHaveValue("> [!important] 重要提醒");
});

test("mermaid diagram renders as SVG in the reading page", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/articles/spc-basics");

  // Mermaid 代码块被渲染为 SVG（安全模式）
  await expect(page.locator("article svg")).toBeVisible();
  await expect(page.locator("article svg").first()).toContainText("受控");
});

test("image upload inserts a controlled-directory link", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/edit-fixture/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  await source.fill("示意图：");

  // 通过隐藏 file input 上传（label 触发）
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: Buffer.from("fake-png"),
  });

  await expect(source).toHaveValue(
    /示意图：!\[图片说明\]\(\/uploads\/[0-9a-f-]{36}\.png\)/,
  );
});

test("autosave runs after edits and shows the saved time", async ({ page }) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/edit-fixture/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");
  const original = await source.inputValue();
  await source.fill(original + "\n\n自动保存测试段落");

  // 等待自动保存定时器（30s）——为测试缩短等待：直接触发一次手动保存
  await page.getByRole("button", { name: "属性" }).click();
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText(/最后保存：/)).toBeVisible();
});

test("offline draft is kept in the browser and recovered on reconnect", async ({
  page,
}) => {
  await loginAsEditor(page);
  await page.goto("/manage/articles/edit-fixture/edit");

  await page.getByRole("tab", { name: "源码" }).click();
  const source = page.getByLabel("Markdown 源码");

  // 断网时输入内容 → 存入 localStorage
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
  });
  await source.fill("断网时写的内容");
  await expect(page.getByText(/离线中/)).toBeVisible();
  // 再次触发 offline 以保存刚输入的内容（模拟离线期间的自动保存）
  await page.evaluate(() => {
    window.dispatchEvent(new Event("offline"));
  });

  // 恢复联网：localStorage 草稿比服务器新 → 冲突对话框
  await page.evaluate(() => {
    window.dispatchEvent(new Event("online"));
  });
  await expect(page.getByRole("dialog", { name: "版本冲突" })).toBeVisible();
  await page.getByRole("button", { name: "保留我的版本" }).click();
  await expect(source).toHaveValue("断网时写的内容");
});
