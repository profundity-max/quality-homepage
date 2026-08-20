import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("editor imports a single markdown file as a draft (PORT-01/05)", async ({
  page,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/import");
  await page
    .getByLabel("Markdown 内容")
    .fill(
      [
        "---",
        "title: 导入测试文章",
        "summary: 由 e2e 导入",
        "topic: anova",
        "tags:",
        "  - 测试",
        "---",
        "",
        "导入正文内容",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "导入为草稿" }).click();
  await expect(page.getByRole("status")).toContainText("已导入 1 篇草稿");
  // 导入内容统一进入草稿（PORT-01/05），发布前不进入阅读/搜索结果
  await expect(page.getByLabel("Markdown 内容")).toHaveValue("");
});

test("single-article and full-site export return readable ZIP packages (PORT-06/07/09)", async ({
  page,
}) => {
  // 用管理员账号执行导出，避免与其他用例对 editor 账号的变更互相干扰
  await login(page, "columnadmin", "column admin secure password");
  const articleResponse = await page
    .context()
    .request.get("/api/migration/export/article?stableId=anova-intro");
  expect(articleResponse.status()).toBe(200);
  expect(articleResponse.headers()["content-type"]).toContain(
    "application/zip",
  );

  const fullResponse = await page
    .context()
    .request.get("/api/migration/export/full");
  expect(fullResponse.status()).toBe(200);
  expect(fullResponse.headers()["content-type"]).toContain("application/zip");
});
