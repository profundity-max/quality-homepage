import { expect, test } from "@playwright/test";

async function login(
  page: import("@playwright/test").Page,
  username: string,
  password: string,
) {
  await page.goto("/login");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("administrator uploads, scans and publishes a template; member can download it", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/templates");

  // 新建模板（进入隔离区，FILE-01）
  await page.getByLabel("新建模板名称").fill("e2e 检验模板");
  await page.getByLabel("新建模板用途说明").fill("用于来料检验");
  await page
    .getByLabel("新建模板用途分类")
    .selectOption({ label: "检验与测试" });
  await page.getByLabel("新建模板版本号").fill("1.0");
  await page.getByLabel("新建模板文件").setInputFiles({
    name: "report.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("fake-xlsx"),
  });
  await page.getByRole("button", { name: "上传模板" }).click();
  await expect(page.getByRole("status")).toContainText("模板已上传");

  const templateCard = page.getByRole("article", { name: "模板 e2e 检验模板" });
  await expect(templateCard).toBeVisible();

  // 扫描通过（FILE-02）
  await templateCard
    .getByRole("button", { name: "扫描版本 e2e 检验模板 v1.0" })
    .click();
  await expect(page.getByRole("status")).toContainText("扫描通过");

  // 发布（TPL-07/08）
  await page
    .getByRole("article", { name: "模板 e2e 检验模板" })
    .getByRole("button", { name: "发布版本 e2e 检验模板 v1.0" })
    .click();
  await expect(page.getByRole("status")).toContainText("模板版本已发布");

  // 阅读者视角：模板中心可见并可下载（TPL-09）
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/templates");
  const category = page.getByRole("region", { name: "检验与测试" });
  await expect(category.getByText("e2e 检验模板")).toBeVisible();
  await category.getByRole("link", { name: /e2e 检验模板/ }).click();
  await expect(
    page.getByRole("heading", { name: "e2e 检验模板" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载当前有效版本" }).click();
  await download;
});

test("long template file names stay fully operable (scan/publish not covered by layout)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/templates");

  const longFileName =
    "This-is-a-very-long-template-file-name-that-exceeds-the-layout-column-and-used-to-overlap-the-next-section-report-2026.pdf";
  await page.getByLabel("新建模板名称").fill("e2e 超长文件名模板");
  await page
    .getByLabel("新建模板用途分类")
    .selectOption({ label: "检验与测试" });
  await page.getByLabel("新建模板版本号").fill("1.0");
  await page.getByLabel("新建模板文件").setInputFiles({
    name: longFileName,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-fake"),
  });
  await page.getByRole("button", { name: "上传模板" }).click();
  await expect(page.getByRole("status")).toContainText("模板已上传");

  const templateCard = page.getByRole("article", {
    name: "模板 e2e 超长文件名模板",
  });
  await expect(templateCard).toBeVisible();
  // 回归：超长文件名导致版本行溢出时，扫描按钮仍可普通点击
  await templateCard.getByRole("button", { name: /扫描版本/ }).click();
  await expect(page.getByRole("status")).toContainText("扫描通过");

  await page.goto("/manage/templates");
  const publishedCard = page.getByRole("article", {
    name: "模板 e2e 超长文件名模板",
  });
  await expect(
    publishedCard.getByRole("button", { name: /发布版本/ }),
  ).toBeVisible();
  await publishedCard.getByRole("button", { name: /发布版本/ }).click();
  await expect(page.getByRole("status")).toContainText("模板版本已发布");

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/templates");
  await expect(
    page.getByRole("link", { name: /e2e 超长文件名模板/ }),
  ).toBeVisible();
});

test("category lifecycle: create, rename, archive reflect on reader side (TPL-04)", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/templates");

  await page.getByLabel("新分类名称").fill("临时分类");
  await page.getByRole("button", { name: "创建分类" }).click();
  await expect(page.getByRole("status")).toContainText("分类已创建");
  await expect(page.getByLabel("重命名分类 临时分类")).toBeVisible();

  const renameInput = page.getByLabel("重命名分类 临时分类");
  await renameInput.fill("临时分类改名");
  await renameInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("分类已改名");
  await expect(page.getByLabel("重命名分类 临时分类改名")).toBeVisible();

  await page.getByLabel("移动分类 临时分类改名 下移").click();
  await expect(page.getByRole("status")).toContainText("分类顺序已调整");

  const archiveForm = page
    .getByLabel("重命名分类 临时分类改名")
    .locator("xpath=ancestor::li");
  await archiveForm.getByLabel("归档分类 临时分类改名 的原因").fill("测试归档");
  await archiveForm.getByRole("button", { name: "归档" }).click();
  await expect(page.getByRole("status")).toContainText("分类已归档");

  // 阅读侧不显示已归档分类
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/templates");
  await expect(page.getByText("临时分类改名")).not.toBeVisible();
});

test("editor can access template management; member is denied", async ({
  page,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/templates");
  await expect(page.getByRole("heading", { name: "模板管理" })).toBeVisible();

  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/manage/templates");
  await expect(page).not.toHaveURL(/\/manage\/templates$/);
});
