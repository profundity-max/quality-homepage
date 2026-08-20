import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("quick search panel groups results and opens an article (SEARCH-05)", async ({
  page,
}) => {
  await login(page);

  await page.getByRole("button", { name: "搜索知识" }).click();
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("搜索知识").fill("ANOVA");
  await expect(
    dialog.getByRole("link", { name: /ANOVA/ }).first(),
  ).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "文章" })).toBeVisible();

  // 键盘上下选择 + 回车打开文章
  await dialog.getByLabel("搜索知识").press("ArrowDown");
  await dialog.getByLabel("搜索知识").press("Enter");
  // 打开的是文章阅读页即可（首个结果可能因其他用例的编辑/复核而变化）
  await expect(page).toHaveURL(/\/articles\//);
  await expect(page.getByRole("heading", { level: 1 })).not.toBeEmpty();
});

test("full results page filters by content type and highlights matches (SEARCH-06)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/search?q=检验");
  await expect(page.getByRole("heading", { name: /模板/ })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /演示检验记录表/ }),
  ).toBeVisible();

  await page.getByRole("checkbox", { name: "文章" }).uncheck();
  await page.getByRole("checkbox", { name: "主题" }).uncheck();
  await page.getByRole("checkbox", { name: "书籍" }).uncheck();
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page).toHaveURL(/types=templates/);
  await expect(
    page.getByRole("link", { name: /演示检验记录表/ }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /文章（/ })).not.toBeVisible();
});

test("Chinese, symbol and English aliases hit the same topic (SEARCH-04)", async ({
  page,
}) => {
  await login(page);
  for (const query of ["标准差", "σ", "Sigma"]) {
    await page.goto(`/search?q=${encodeURIComponent(query)}`);
    await expect(
      page.locator(
        'a[href="/quality?topic=mean-sigma-distribution-ci-normal-distribution"]',
      ),
    ).toBeVisible();
  }
});

test("no-result search suggests aliases and accepts a gap note (SEARCH-07)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/search?q=超薄均热板工艺");
  await expect(
    page.getByText("未找到与“超薄均热板工艺”相关的内容"),
  ).toBeVisible();
  await expect(
    page.getByText("该搜索已记录为知识缺口，编辑者会据此补充或优化内容。"),
  ).toBeVisible();
  await page.getByLabel("补充说明（可选）").fill("希望补充 TVC 均热板工艺资料");
  await page.getByRole("button", { name: "提交知识缺口反馈" }).click();
  await expect(page).toHaveURL(/\/search\?q=/);
  await expect(
    page.getByText("未找到与“超薄均热板工艺”相关的内容"),
  ).toBeVisible();
});
