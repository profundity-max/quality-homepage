import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("member secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("selected homepage layout and real search are implemented", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "从数据可信，到过程受控",
  );
  await expect(
    page.getByAltText("同均值、不同标准差的正态分布示意图"),
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "知识分类" }),
  ).toBeVisible();
  await page
    .getByRole("search", { name: "首页搜索" })
    .getByRole("searchbox")
    .fill("ANOVA");
  await page
    .getByRole("search", { name: "首页搜索" })
    .getByRole("button", { name: "搜索", exact: true })
    .click();
  await expect(page).toHaveURL(/\/search\?q=ANOVA/);
  await expect(
    page.getByRole("link", { name: /ANOVA 入门/ }).first(),
  ).toBeVisible();
});

test("all public routes share the editorial theme without viewport overflow", async ({
  page,
  context,
}) => {
  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "q_nexus_theme", value: theme, url: "http://127.0.0.1:3000" },
    ]);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/",
        "/onboarding",
        "/quality?topic=anova",
        "/thermal",
        "/books",
        "/templates",
        "/search",
        "/favorites",
        "/articles/anova-intro",
      ]) {
        await page.goto(path);
        await expect(page.locator("body")).toHaveCSS(
          "background-color",
          theme === "light" ? "rgb(250, 249, 246)" : "rgb(23, 29, 27)",
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${theme} ${width} ${path}`,
        ).toBe(true);
      }
    }
  }
});

test("inline reading has distinct heading anchors, usable TOC and content protection", async ({
  page,
}) => {
  await page.goto("/quality?topic=anova");
  await expect(
    page.getByRole("heading", { level: 1, name: "ANOVA", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("正文目录", { exact: true })).toBeVisible();
  const headings = await page
    .locator("article [id]")
    .evaluateAll((nodes) => nodes.map((node) => node.id));
  expect(headings.length).toBeGreaterThan(0);
  expect(new Set(headings).size).toBe(headings.length);
  await expect(
    page.locator('[data-restrict-copy="true"]').first(),
  ).toBeVisible();
  const first = page
    .getByLabel("正文目录", { exact: true })
    .getByRole("link")
    .first();
  const href = await first.getAttribute("href");
  await first.click();
  await expect(page.locator(href!)).toBeInViewport();
});

test("homepage, inline reading and resources pass serious accessibility checks", async ({
  page,
}) => {
  for (const path of [
    "/",
    "/quality?topic=anova",
    "/onboarding",
    "/templates",
    "/books",
    "/search",
    "/favorites",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
      path,
    ).toEqual([]);
  }
});

test("quick search follows dark roots and closes on same-route selection", async ({
  page,
}) => {
  await page.goto("/quality?topic=anova");
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(23, 29, 27)",
  );
  await page.getByRole("button", { name: "搜索知识", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  await expect(dialog).toHaveCSS("background-color", "rgb(32, 40, 37)");
  await dialog.getByLabel("搜索知识").fill("ANOVA");
  await dialog
    .getByRole("region", { name: "主题", exact: true })
    .getByRole("link", { name: /ANOVA/ })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("quick search ignores stale responses and Enter without selection opens full results", async ({
  page,
}) => {
  await page.route("**/api/search/quick?**", async (route) => {
    if (route.request().url().includes("slow")) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.fulfill({
        json: {
          articles: [
            { stableId: "stale", title: "过期结果", sectionName: "旧查询" },
          ],
          topics: [],
          templates: [],
          books: [],
        },
      });
    } else await route.continue();
  });
  await page.getByRole("button", { name: "搜索知识", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  const input = dialog.getByLabel("搜索知识");
  await input.fill("slow");
  await page.waitForRequest("**/api/search/quick?q=slow");
  await input.fill("ANOVA");
  await expect(dialog.getByRole("link", { name: /ANOVA 入门/ })).toBeVisible();
  await expect(dialog.getByText("过期结果")).toHaveCount(0);
  await input.press("Enter");
  await expect(page).toHaveURL(/\/search\?q=ANOVA/);
  await expect(dialog).toHaveCount(0);
});

test("system dark theme reaches login, console and quick-search portal", async ({
  page,
  context,
}) => {
  await context.clearCookies({ name: "q_nexus_theme" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(23, 29, 27)",
  );
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/login/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(23, 29, 27)",
  );
  await page.getByLabel("用户名").fill("columnadmin");
  await page
    .getByLabel("密码", { exact: true })
    .fill("column admin secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(23, 29, 27)",
  );
  await expect(
    page.getByRole("navigation", { name: "后台导航", exact: true }).first(),
  ).toBeVisible();
});

test("quick search failure preserves the term and can be retried", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/api/search/quick?**", async (route) => {
    if (unavailable)
      await route.fulfill({ status: 503, json: { error: "Unavailable" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "搜索知识", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  await dialog.getByLabel("搜索知识").fill("ANOVA");
  await expect(dialog.getByRole("alert")).toContainText("搜索暂时不可用");
  await expect(dialog.getByLabel("搜索知识")).toHaveValue("ANOVA");
  unavailable = false;
  await dialog.getByRole("button", { name: "重试", exact: true }).click();
  await expect(dialog.getByRole("link", { name: /ANOVA 入门/ })).toBeVisible();
});

test("selected category design exposes topic, article index and complete article headings", async ({
  page,
}) => {
  await page.goto("/quality?topic=anova");
  await expect(
    page.getByRole("heading", { level: 1, name: "ANOVA", exact: true }),
  ).toBeVisible();
  const index = page.getByRole("navigation", {
    name: "本主题文章",
    exact: true,
  });
  await expect(
    index.getByRole("link", { name: "ANOVA 入门", exact: true }),
  ).toBeVisible();
  await index.getByRole("link", { name: "ANOVA 入门", exact: true }).click();
  await expect(
    page
      .getByLabel("文章 ANOVA 入门", { exact: true })
      .getByRole("heading", { level: 2, name: "ANOVA 入门", exact: true }),
  ).toBeInViewport();
});

test("console primary buttons retain readable text in dark theme", async ({
  page,
  context,
}) => {
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.getByLabel("用户名").fill("columnadmin");
  await page
    .getByLabel("密码", { exact: true })
    .fill("column admin secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await context.addCookies([
    { name: "q_nexus_theme", value: "dark", url: "http://127.0.0.1:3000" },
  ]);
  await page.goto("/manage/stats");
  await expect(page.locator('a[href*="people-export"]')).toHaveCSS(
    "color",
    "rgb(20, 37, 30)",
  );
  await page.goto("/manage/backups");
  await expect(
    page.getByRole("button", { name: "立即执行手动备份" }),
  ).toHaveCSS("color", "rgb(20, 37, 30)");
});

test("view more recent updates opens a real feed instead of a construction placeholder", async ({
  page,
}) => {
  await page
    .getByRole("region", { name: "最近更新" })
    .getByRole("link", { name: "查看更多" })
    .click();
  await expect(page).toHaveURL(/\/updates$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "最近更新", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: /ANOVA 入门/ }),
  ).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText("内容建设中");
});
