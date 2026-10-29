import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("member secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("editorial theme follows light, dark and system throughout the portal", async ({
  page,
  context,
}) => {
  await page.goto("/articles/anova-example");
  const boundary = page.locator('[data-design-system="editorial"]');
  await expect(boundary).toBeVisible();
  await expect(boundary).toHaveCSS("background-color", "rgb(250, 249, 246)");
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await expect(boundary).toHaveCSS("background-color", "rgb(23, 29, 27)");
  await page.getByText("内容反馈", { exact: true }).click();
  await expect(page.getByRole("button", { name: "提交反馈" })).toHaveCSS(
    "color",
    "rgb(20, 37, 30)",
  );
  await context.clearCookies({ name: "q_nexus_theme" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(boundary).toHaveCSS("background-color", "rgb(23, 29, 27)");
  await page.goto("/");
  await expect(boundary).toHaveCount(1);
});

test("adjacent links do not create an implicit mobile grid column", async ({
  page,
  context,
}) => {
  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "q_nexus_theme", value: theme, url: "http://127.0.0.1:3000" },
    ]);
    for (const width of [320, 375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/articles/anova-example");
      await expect(
        page.getByLabel("上下篇导航").getByRole("link", { name: "ANOVA 入门" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      if (width < 768) {
        const bounds = await page
          .locator("article[data-reading-article]")
          .boundingBox();
        expect(bounds?.width).toBeGreaterThanOrEqual(width - 42);
      }
    }
  }
});

test("metadata wraps and compact TOC stays reachable", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/articles/anova-example");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 实例",
  );
  await expect(page.getByLabel("文章信息")).toContainText("品质管理员");
  const toc = page.locator("summary").filter({ hasText: "本页目录" });
  await toc.click();
  const nav = page
    .getByRole("navigation", { name: "正文目录导航" })
    .filter({ visible: true });
  await nav.getByRole("link", { name: "计算步骤" }).click();
  const heading = page.getByRole("heading", { name: "计算步骤", exact: true });
  await expect(heading).toBeInViewport();
  const headingBounds = await heading.boundingBox();
  const headerBounds = await page.locator("header").first().boundingBox();
  expect(headingBounds!.y).toBeGreaterThanOrEqual(headerBounds!.height);
  await expect(page.getByText("分类导航", { exact: true })).toBeVisible();
});

test("article navigation refreshes shared Markdown content", async ({
  page,
}) => {
  await page.goto("/articles/anova-intro");
  await page
    .getByLabel("上下篇导航")
    .getByRole("link", { name: "ANOVA 实例" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ANOVA 实例",
  );
  await expect(page.locator("article table")).toBeVisible();
  await expect(page.locator("article .katex-display")).toHaveCount(2);
});

test("Mermaid responds to the reading theme", async ({ page }) => {
  await page.goto("/articles/spc-basics");
  const svg = page.locator("article svg[role=img]");
  await expect(svg).toBeVisible();
  const before = await svg
    .locator(".node rect")
    .first()
    .evaluate((node) => getComputedStyle(node).fill);
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await expect
    .poll(async () =>
      svg
        .locator(".node rect")
        .first()
        .evaluate((node) => getComputedStyle(node).fill),
    )
    .not.toBe(before);
});

test("wide content scrolls locally without truncating data", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/articles/sigma-basics");
  const table = page.getByRole("region", { name: "表格，可左右滚动" });
  await expect(table).toContainText("123471.78");
  expect(
    await table.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  await table.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => table.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  const formula = page.getByRole("region", { name: "公式，可左右滚动" });
  expect(
    await formula.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  for (const theme of ["dark", "light"] as const) {
    const button = page.getByRole("button", {
      name: `切换到${theme === "dark" ? "深" : "浅"}色模式`,
    });
    // Compact header keeps theme controls in its existing navigation menu.
    if (!(await button.isVisible()))
      await page.getByLabel("打开主导航").click();
    await button.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("article .callout")).toHaveCount(6);
    await expect(page.locator("article .callout-warning")).toHaveCSS(
      "border-left-color",
      theme === "light" ? "rgb(154, 107, 47)" : "rgb(207, 167, 113)",
    );
    await expect(
      page.locator("article .callout-warning .callout-title"),
    ).toHaveCSS(
      "color",
      theme === "light" ? "rgb(150, 103, 45)" : "rgb(207, 167, 113)",
    );
    await expect(page.locator("article .callout").first()).toHaveCSS(
      "font-weight",
      "700",
    );
  }
  await page.goto(
    "/quality?topic=mean-sigma-distribution-ci-normal-distribution",
  );
  await expect(page.locator('[data-design-system="editorial"]')).toHaveCount(1);
  await expect(page.locator(".callout-warning .callout-title")).toHaveCSS(
    "color",
    "rgb(150, 103, 45)",
  );
});

test("compact header is an overlay at 1150px and classification is keyboard reachable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1150, height: 900 });
  await page.goto("/articles/anova-example");
  const header = page.locator("header").first();
  const before = await header.boundingBox();
  const menu = page.getByLabel("打开主导航");
  await menu.focus();
  await page.keyboard.press("Enter");
  const navigation = page.getByRole("navigation", { name: "移动端主导航链接" });
  await expect(navigation).toBeVisible();
  expect((await header.boundingBox())!.height).toBe(before!.height);
  expect(
    (await navigation.getByRole("link").first().boundingBox())!.height,
  ).toBeGreaterThanOrEqual(44);
  await menu.press("Enter");
  const classification = page
    .locator("summary")
    .filter({ hasText: "分类导航" });
  await classification.focus();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("navigation", { name: "分类导航", exact: true })
      .getByRole("link", { name: "ANOVA", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

for (const width of [375, 1440]) {
  for (const theme of ["light", "dark"] as const) {
    test(`reading screenshot and accessibility ${width} ${theme}`, async ({
      page,
      context,
    }, testInfo) => {
      await context.addCookies([
        { name: "q_nexus_theme", value: theme, url: "http://127.0.0.1:3000" },
      ]);
      await page.setViewportSize({ width, height: width === 375 ? 812 : 1000 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/articles/anova-example");
      await expect(page.locator("article .katex-display")).toHaveCount(2);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      expect(results.violations).toEqual([]);
      await page.addStyleTag({
        content: "nextjs-portal { display:none !important; }",
      });
      await page.screenshot({
        path: testInfo.outputPath(`reading-${width}-${theme}-fold.png`),
        animations: "disabled",
      });
      await page.screenshot({
        path: testInfo.outputPath(`reading-${width}-${theme}.png`),
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}

test("thermal article keeps its real root and long title at compact widths", async ({
  page,
}) => {
  test.skip(
    process.env.Q_NEXUS_E2E_READING_FIXTURES !== "1" &&
      test.info().config.metadata.readingFixtures !== true,
    "Dedicated thermal fixture is opt-in to preserve the empty-section regression.",
  );
  await page.setViewportSize({ width: 320, height: 812 });
  await page.goto("/articles/thermal-reading-fixture");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "在复杂设备中理解热阻与温升：从测量边界到工程决策的完整阅读样本",
  );
  await expect(
    page.getByLabel("面包屑").getByRole("link", { name: "传热基础" }),
  ).toHaveAttribute("href", "/thermal?topic=thermal-reading-fixture");
  await expect(page.getByRole("status")).toHaveText(
    "图解暂时无法显示，以下保留原始内容。",
  );
  await expect(page.locator("article pre")).toContainText(
    "this is not a valid diagram",
  );
  const classification = page
    .locator("summary")
    .filter({ hasText: "分类导航" });
  await classification.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("navigation", { name: "分类导航", exact: true })
    .getByRole("link", { name: "传热基础" })
    .click();
  await expect(page).toHaveURL(/\/thermal\?topic=thermal-reading-fixture/);
  await expect(page.locator('[data-design-system="editorial"]')).toHaveCount(1);
});

test("reading reflows with text enlarged to 200 percent", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/articles/anova-example");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(
    page.getByText("三组样本的均值比较。", { exact: true }),
  ).toHaveCSS("font-size", "32px");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const summary = page.locator("summary").filter({ hasText: "本页目录" });
  await summary.click();
  await page
    .getByRole("navigation", { name: "正文目录导航" })
    .filter({ visible: true })
    .getByRole("link", { name: "计算步骤" })
    .click();
  const heading = page.getByRole("heading", { name: "计算步骤", exact: true });
  await expect(heading).toBeFocused();
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(
    (await page.locator("header").first().boundingBox())!.height,
  );
});

test("editorial theme covers home, inline reading and preserves three admin views", async ({
  page,
}, testInfo) => {
  for (const path of ["/", "/quality?topic=anova"]) {
    await page.goto(path);
    await expect(page.locator('[data-design-system="editorial"]')).toHaveCount(
      1,
    );
    await page.screenshot({
      path: testInfo.outputPath(
        path === "/" ? "home.png" : "inline-reading.png",
      ),
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.goto("/");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.screenshot({
    path: testInfo.outputPath("login.png"),
    animations: "disabled",
  });
  await page.getByLabel("用户名").fill("columnadmin");
  await page
    .getByLabel("密码", { exact: true })
    .fill("column admin secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const [name, path] of [
    ["accounts", "/manage"],
    ["articles", "/manage/articles"],
    ["statistics", "/manage/stats"],
  ]) {
    await page.goto(path);
    await expect(page.locator("main")).toBeVisible();
    await expect(page.locator('[data-design-system="editorial"]')).toHaveCount(
      0,
    );
    await page.screenshot({
      path: testInfo.outputPath(`editorial-${name}.png`),
      fullPage: true,
      animations: "disabled",
    });
  }
});
