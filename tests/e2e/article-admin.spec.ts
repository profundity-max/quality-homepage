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

async function loginAsEditor(page: import("@playwright/test").Page) {
  await login(page, "editor", "editor secure password");
}

async function createDraftThroughUi(
  page: import("@playwright/test").Page,
  draft: { title: string; summary?: string; body?: string; topic?: string },
) {
  await page.goto("/manage/articles/new");
  if (draft.body !== undefined) {
    await page.getByRole("tab", { name: "源码" }).click();
    await page.getByLabel("Markdown 源码").fill(draft.body);
  }
  await page.getByRole("button", { name: "属性" }).click();
  const properties = page.getByLabel("文章属性");
  await properties.getByLabel("标题").fill(draft.title);
  if (draft.summary !== undefined) {
    await properties.getByLabel("摘要").fill(draft.summary);
  }
  if (draft.topic !== "") {
    await properties
      .getByLabel("主题")
      .selectOption({ label: draft.topic ?? "ANOVA" });
  }
  await properties.getByLabel("内容负责人").selectOption({ label: "品质编辑" });
  await properties.getByLabel("下次复核日期").fill("2027-06-30");
  await properties.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByRole("status")).toContainText(/草稿已(创建|保存)/);
}

test("editor maintains an article from the manage entry (list → new draft with alias → reopen)", async ({
  page,
}) => {
  await loginAsEditor(page);

  // 管理落地页 → 文章管理
  await page.goto("/manage");
  await page.getByRole("link", { name: "文章管理" }).click();
  await expect(page).toHaveURL(/\/manage\/articles$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "文章管理" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "新建文章" })).toBeVisible();
  await expect(page.getByText("ANOVA 入门")).toBeVisible();

  // 新建草稿
  await page.getByRole("link", { name: "新建文章" }).click();
  await expect(page).toHaveURL(/\/manage\/articles\/new$/);
  await page.getByRole("tab", { name: "源码" }).click();
  await page
    .getByLabel("Markdown 源码")
    .fill("## 编辑者维护测试\n\n这是通过文章管理入口创建的草稿。");

  await page.getByRole("button", { name: "属性" }).click();
  const properties = page.getByLabel("文章属性");
  await properties.getByLabel("标题").fill("编辑者维护测试文章");
  await properties.getByLabel("摘要").fill("通过文章管理入口创建的草稿");
  await properties.getByLabel("主题").selectOption({ label: "ANOVA" });
  await properties.getByLabel("标签（逗号分隔）").fill("测试, 编辑者");
  await properties.getByLabel(/知识别名/).fill("编辑别名, EditorAlias");
  await properties.getByLabel("内容负责人").selectOption({ label: "品质编辑" });
  await properties.getByLabel("下次复核日期").fill("2027-06-30");
  await properties.getByRole("button", { name: "保存草稿" }).click();

  await expect(page.getByRole("status")).toContainText(/草稿已(创建|保存)/);

  // 草稿出现在管理列表（状态筛选中可见）
  await page.goto("/manage/articles?status=draft");
  await expect(page.getByText("编辑者维护测试文章")).toBeVisible();

  // 重新打开：别名与负责人回填正确
  await page
    .getByText("编辑者维护测试文章")
    .locator("xpath=ancestor::li")
    .getByRole("link", { name: "编辑" })
    .click();
  await page.getByRole("button", { name: "属性" }).click();
  const aliasValue = await page.getByLabel(/知识别名/).inputValue();
  expect(aliasValue).toContain("编辑别名");
  expect(aliasValue).toContain("EditorAlias");
  await expect(page.getByLabel("内容负责人")).toHaveValue(/.+/);
});

test("editor publishes a draft straight from the article list, without opening the editor", async ({
  page,
}) => {
  await loginAsEditor(page);
  await createDraftThroughUi(page, {
    title: "列表发布验证文章",
    summary: "从文章管理列表直接发布草稿",
    body: "## 列表发布\n\n这篇草稿不打开编辑器也能发布。",
  });

  await page.goto("/manage/articles?status=draft");
  const row = page.getByText("列表发布验证文章").locator("xpath=ancestor::li");
  await expect(row).toContainText("草稿");
  const editHref = await row
    .getByRole("link", { name: "编辑" })
    .getAttribute("href");
  const stableId = /\/manage\/articles\/([^/]+)\/edit/.exec(
    editHref ?? "",
  )?.[1];
  expect(stableId).toBeTruthy();

  await row.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已发布。");
  await expect(page).toHaveURL(/\/manage\/articles\?notice=/);

  // 发布后离开草稿箱：草稿筛选看不到，已发布筛选能看到
  await page.goto("/manage/articles?status=draft");
  await expect(page.getByText("列表发布验证文章")).toHaveCount(0);
  await page.goto("/manage/articles?status=published");
  const publishedRow = page
    .getByText("列表发布验证文章")
    .locator("xpath=ancestor::li");
  await expect(publishedRow).toContainText("已发布");
  await expect(
    publishedRow.getByRole("button", { name: "发布", exact: true }),
  ).toHaveCount(0);

  // 阅读侧立即可见
  await page.goto(`/articles/${stableId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "列表发布验证文章" }),
  ).toBeVisible();

  // 收尾：把验证文章退回草稿，避免影响首页“最近更新”等依赖种子的用例
  await page.goto("/manage/articles?status=published");
  await page
    .getByText("列表发布验证文章")
    .locator("xpath=ancestor::li")
    .getByRole("link", { name: "编辑" })
    .click();
  await page.getByRole("button", { name: "属性" }).click();
  await page
    .getByLabel("文章属性")
    .getByRole("button", { name: "保存草稿" })
    .click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");
});

test("publishing from the list reports missing required fields instead of silently failing", async ({
  page,
}) => {
  await loginAsEditor(page);
  await createDraftThroughUi(page, {
    title: "列表发布缺项文章",
    body: "## 只有正文\n\n摘要留空，用来验证列表发布的必填校验。",
  });

  await page.goto("/manage/articles?status=draft");
  const row = page.getByText("列表发布缺项文章").locator("xpath=ancestor::li");
  await row.getByRole("button", { name: "发布", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "发布缺少必填项" }),
  ).toContainText("发布缺少必填项：摘要");
  await expect(page).toHaveURL(/\/manage\/articles\?.*error=/);

  // 校验失败不改变状态：仍在草稿列表
  await page.goto("/manage/articles?status=draft");
  await expect(page.getByText("列表发布缺项文章")).toBeVisible();
});

test("editor archives a test article from the list: it leaves the reading side and admin can restore it", async ({
  page,
}) => {
  await loginAsEditor(page);
  await createDraftThroughUi(page, {
    title: "列表归档验证文章",
    summary: "用于验证列表页归档入口",
    body: "## 归档验证\n\n这篇临时文章用来验证归档入口。",
  });

  // 先发布，才能验证归档后阅读侧不再展示
  await page.goto("/manage/articles?status=draft");
  const draftRow = page
    .getByText("列表归档验证文章")
    .locator("xpath=ancestor::li");
  const editHref = await draftRow
    .getByRole("link", { name: "编辑" })
    .getAttribute("href");
  const stableId = /\/manage\/articles\/([^/]+)\/edit/.exec(
    editHref ?? "",
  )?.[1];
  expect(stableId).toBeTruthy();
  await draftRow.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已发布。");

  await page.goto("/quality?topic=anova");
  await expect(
    page.getByLabel("文章 列表归档验证文章", { exact: true }),
  ).toBeVisible();

  // 列表页归档：填写原因后立即生效
  await page.goto("/manage/articles");
  const row = page.getByText("列表归档验证文章").locator("xpath=ancestor::li");
  await row.getByLabel("归档文章 列表归档验证文章 的原因").fill("临时测试内容");
  // 行内归档表单在窄屏也不能撑出横向滚动
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await row.getByRole("button", { name: "归档", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已归档。");

  // 归档后：管理列表归到「已归档」，阅读侧不再展示，旧链接给归档说明
  await page.goto("/manage/articles?status=archived");
  const archivedRow = page
    .getByText("列表归档验证文章")
    .locator("xpath=ancestor::li");
  await expect(archivedRow).toContainText("已归档");
  await expect(
    archivedRow.getByLabel("归档文章 列表归档验证文章 的原因"),
  ).toHaveCount(0);
  await page.goto("/quality?topic=anova");
  await expect(page.getByText("列表归档验证文章")).toHaveCount(0);
  await page.goto(`/articles/${stableId}`);
  await expect(page.getByText("该文章已归档，正文不再展示。")).toBeVisible();

  // 管理员在回收站恢复（DEL-01/DEL-02）
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/recycle-bin?type=article");
  const trashed = page
    .getByText("列表归档验证文章")
    .locator("xpath=ancestor::li");
  await expect(trashed).toContainText("归档于");
  await expect(
    trashed.getByRole("button", { name: "永久删除" }),
  ).toBeDisabled();
  await trashed.getByRole("button", { name: "恢复" }).click();
  await expect(page.getByRole("status")).toContainText("已恢复");
  await expect(page.getByText("列表归档验证文章")).toHaveCount(0);

  // 收尾：恢复回来的是草稿，回到草稿箱不影响任何阅读入口
  await page.getByRole("button", { name: "退出登录" }).click();
  await loginAsEditor(page);
  await page.goto("/manage/articles?status=draft");
  await expect(page.getByText("列表归档验证文章")).toBeVisible();
});

test("reader cannot reach article management", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage/articles");
  await expect(page).not.toHaveURL(/\/manage\/articles$/);
});
