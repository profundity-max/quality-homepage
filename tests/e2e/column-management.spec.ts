import { expect, test } from "@playwright/test";

async function loginAsColumnAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("columnadmin");
  await page.getByLabel("密码").fill("column admin secure password");
  await page.getByLabel("保持登录").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("administrator can rename a topic without breaking its stable link", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // 找到 ANOVA 主题改名
  const renameInput = page.getByLabel("重命名主题 ANOVA");
  await renameInput.fill("ANOVA 方差分析");
  await renameInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();

  await expect(page).toHaveURL(/manage\/columns/);
  await expect(page.getByRole("status")).toContainText("主题已改名");
  await expect(page.getByText("ANOVA 方差分析")).toBeVisible();

  // 改名不破坏旧链接（IA-03）：知识入口的 ?topic=anova 仍有效
  await page.goto("/quality?topic=anova");
  // 主题名显示在左侧分类树（正文区已精简，不再重复主题标题）
  await expect(
    page
      .getByRole("complementary", { name: "分类树" })
      .getByRole("link", { name: "ANOVA 方差分析" }),
  ).toHaveAttribute("aria-current", "page");

  // 还原主题名，避免污染后续依赖 "ANOVA" 名称的 e2e（知识入口、阅读路径等）
  await page.goto("/manage/columns");
  const renameBack = page.getByLabel("重命名主题 ANOVA 方差分析");
  await renameBack.fill("ANOVA");
  await renameBack
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("主题已改名");
});

test("administrator sees empty topics in the admin view (IA-08)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");
  // MSA 主题在种子中无已发布文章，但管理后台可见
  await expect(page.getByText("MSA")).toBeVisible();
});

test("archiving a topic with published articles is refused (IA-09)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // SPC 有已发布文章（seed spc-basics），归档应被拒绝；
  // 用 SPC 而非 ANOVA，避免与改名测试的持久修改相互干扰。
  const renameInput = page.getByLabel("重命名主题 SPC");
  const row = renameInput.locator(
    "xpath=ancestor::div[.//button[text()='归档']][1]",
  );
  await row.getByLabel("归档主题 SPC 的原因").fill("迁移前尝试");
  await row.getByRole("button", { name: "归档" }).click();
  await expect(
    page.getByText("该主题仍有已发布文章，请先迁移到其他主题再归档。"),
  ).toBeVisible();
  await expect(page.getByLabel("重命名主题 SPC")).toBeVisible();
});

test("reader cannot access column management", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/manage/columns");
  // 阅读者被重定向离开管理页
  await expect(page).not.toHaveURL(/\/manage\/columns$/);
});

test("administrator can reorder topics (IA-07)", async ({ page }) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");

  // SPC 不被改名测试触碰；上移一次
  await page.getByLabel("移动主题 SPC 上移").click();
  await expect(page.getByRole("status")).toContainText("排序已调整");

  // 仍可通过稳定标识访问（IA-03 不受排序影响）
  await page.goto("/quality?topic=spc");
  await expect(
    page
      .getByRole("complementary", { name: "分类树" })
      .getByRole("link", { name: "SPC" }),
  ).toHaveAttribute("aria-current", "page");
});

test("management page shows due reviews and confirms still valid (GOV-02/03)", async ({
  page,
}) => {
  await loginAsColumnAdmin(page);
  await page.goto("/manage");

  // 待复核区块包含 anova-intro（seed 中复核已到期）
  const reviews = page.getByLabel("待复核内容");
  await expect(reviews).toContainText("ANOVA 入门");

  // 确认仍然有效 → 区块更新
  await reviews.getByRole("button", { name: "确认仍然有效" }).click();
  await expect(page.getByRole("status")).toContainText("内容复核已更新");
});

test("editor can maintain columns and topics (permission update)", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  // 编辑者的管理落地页应包含新人路线与栏目入口
  await page.goto("/manage");
  await expect(
    page.getByRole("heading", { level: 1, name: "内容管理" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "新人路线管理" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "栏目与主题管理" }),
  ).toBeVisible();

  // 编辑者可进入栏目管理并执行改名（随后还原）
  await page.goto("/manage/columns");
  await expect(
    page.getByRole("heading", { level: 1, name: "栏目" }),
  ).toBeVisible();
  const renameInput = page.getByLabel("重命名栏目 品质知识");
  await renameInput.fill("品质知识（编辑者改名）");
  await renameInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("栏目已改名");

  const restoreInput = page.getByLabel("重命名栏目 品质知识（编辑者改名）");
  await restoreInput.fill("品质知识");
  await restoreInput
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "改名" })
    .click();
  await expect(page.getByRole("status")).toContainText("栏目已改名");
});

test("twelve new topics retain their order and repeated clicks move one row at a time", async ({
  page,
}) => {
  test.setTimeout(90000);
  await loginAsColumnAdmin(page);
  await page.goto("/manage/columns");
  const forms = page.locator(
    'form:has(input[name="parentStableId"][value="problem-solving"])',
  );
  const names = Array.from({ length: 12 }, (_, i) => `排序回归 ${i}`);
  for (const name of names) {
    await forms.getByLabel("新主题名称", { exact: true }).fill(name);
    await forms.getByRole("button", { name: "新增主题", exact: true }).click();
    await expect(
      page.getByLabel(`重命名主题 ${name}`, { exact: true }),
    ).toBeVisible();
  }
  const order = () =>
    page
      .getByRole("textbox", { name: /^重命名主题 排序回归 / })
      .evaluateAll((nodes) => nodes.map((n) => (n as HTMLInputElement).value));
  expect(await order()).toEqual(names);
  const expected = [...names];
  for (let step = 0; step < 4; step++) {
    await page
      .getByRole("button", { name: "移动主题 排序回归 11 上移", exact: true })
      .click();
    const index = expected.indexOf(names[11]);
    [expected[index - 1], expected[index]] = [
      expected[index],
      expected[index - 1],
    ];
    await expect.poll(order).toEqual(expected);
    await expect(page).toHaveURL(/#topic-/);
  }
  await page.reload();
  expect(await order()).toEqual(expected);
});
