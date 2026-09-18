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

test("administrator adds, reorders and removes an existing article without deleting it", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/onboarding");
  const list = page
    .getByLabel("路线文章", { exact: true })
    .getByRole("listitem");
  await expect(list).toHaveCount(6);
  await page.getByLabel("文章标题", { exact: true }).fill("ANOVA 入门");
  await page.getByRole("button", { name: "搜索文章" }).click();
  await page
    .getByRole("button", { name: "加入路线 ANOVA 入门", exact: true })
    .click();
  await expect(list).toHaveCount(7);
  await page
    .getByRole("button", { name: "上移 ANOVA 入门", exact: true })
    .click();
  await expect(list.nth(5)).toContainText("ANOVA 入门");
  await page.goto("/onboarding");
  await expect(
    page.getByLabel("新人路线总览").getByRole("listitem").nth(5),
  ).toContainText("ANOVA 入门");
  await page.goto("/manage/onboarding");
  await page
    .getByRole("button", { name: "移出路线 ANOVA 入门", exact: true })
    .click();
  await expect(list).toHaveCount(6);
  await page.goto("/articles/anova-intro");
  await expect(
    page.getByRole("heading", { level: 1, name: "ANOVA 入门" }),
  ).toBeVisible();
});

test("editor creates and publishes a route article, while later draft changes stay private", async ({
  page,
  browser,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/onboarding");
  await page.getByRole("link", { name: "新建路线文章" }).click();
  await expect(page).toHaveURL(/\/manage\/articles\/new\?from=onboarding/);
  await page.getByRole("tab", { name: "源码", exact: true }).click();
  await page
    .getByLabel("Markdown 源码")
    .fill("## 开始工作\n\n这是一篇可维护的路线文章。");
  await page.getByRole("button", { name: "属性", exact: true }).click();
  const properties = page.getByLabel("文章属性");
  await properties.getByLabel("标题", { exact: true }).fill("路线操作验证文章");
  await properties
    .getByLabel("摘要", { exact: true })
    .fill("路线文章已发布的摘要");
  await expect(
    properties.getByRole("combobox", { name: "主题", exact: true }),
  ).toHaveValue(/.+/);
  await properties.getByLabel("内容负责人").selectOption({ label: "品质编辑" });
  await properties.getByLabel("下次复核日期").fill("2027-06-30");
  await properties
    .getByRole("button", { name: "保存草稿", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("草稿已创建");
  await expect(page.getByRole("link", { name: "返回新人路线" })).toBeVisible();
  await page.getByRole("button", { name: "属性", exact: true }).click();
  await properties.getByRole("button", { name: "发布", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("文章已发布");
  await page.getByRole("link", { name: "返回新人路线" }).click();
  const row = page.getByLabel("路线文章 路线操作验证文章", { exact: true });
  await expect(row).toContainText("已发布");
  await row.getByRole("link", { name: "编辑文章", exact: true }).click();
  await page.getByRole("button", { name: "属性", exact: true }).click();
  await properties.getByLabel("标题", { exact: true }).fill("路线未发布标题");
  await properties
    .getByRole("button", { name: "保存草稿", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("草稿已保存");

  const readerContext = await browser.newContext();
  const reader = await readerContext.newPage();
  await login(reader, "member", "member secure password");
  await reader.goto("/onboarding");
  await expect(reader.getByLabel("新人路线总览")).toContainText(
    "路线操作验证文章",
  );
  await expect(reader.getByLabel("新人路线总览")).not.toContainText(
    "路线未发布标题",
  );
  await readerContext.close();

  await page.getByRole("link", { name: "返回新人路线" }).click();
  await expect(page.getByLabel("路线文章 路线未发布标题")).toContainText(
    "有待发布修改",
  );
  await page
    .getByRole("button", { name: "移出路线 路线未发布标题", exact: true })
    .click();
  await expect(
    page.getByLabel("路线文章", { exact: true }).getByRole("listitem"),
  ).toHaveCount(6);
});

test("editor can maintain the route in both themes at 390px; reader is denied", async ({
  page,
}) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/onboarding");
  await expect(
    page.getByRole("heading", { level: 1, name: "新人路线", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const theme of ["light", "dark"]) {
    await page.evaluate((value) => {
      document.documentElement.dataset.theme = value;
    }, theme);
    await expect(
      page.getByRole("link", { name: "新建路线文章" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/manage/onboarding");
  await expect(page).not.toHaveURL(/\/manage\/onboarding$/);
});
