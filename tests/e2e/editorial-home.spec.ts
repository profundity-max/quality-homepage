import { expect, test } from "@playwright/test";

test("Editorial Space works across desktop, theme, keyboard, and mobile", async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  const publicNetworkRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
      publicNetworkRequests.push(request.url());
    }
  });

  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "品质成员",
  );
  await expect(page.getByText("数据驱动 · 结果闭环")).toBeVisible();

  const expectedNavigation = [
    "首页",
    "新人专区",
    "品质知识",
    "散热知识",
    "推荐书单",
    "模板中心",
  ];
  await expect(
    page.getByRole("navigation", { name: "主导航" }).getByRole("link"),
  ).toHaveText(expectedNavigation);
  await expect(
    page.getByRole("link", { name: "首页", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.locator("main section").getByRole("heading", { level: 2 }),
  ).toHaveText([
    "新人学习",
    "常用模板",
    "品质知识",
    "散热知识",
    "最近更新",
    "推荐书籍",
  ]);
  await expect(
    page.getByRole("heading", { name: "新人学习" }).locator(".."),
  ).toHaveAttribute("href", "/onboarding");
  await expect(
    page.getByRole("heading", { name: "常用模板" }).locator(".."),
  ).toHaveAttribute("href", "/templates");

  const heroRatio = await page
    .getByTestId("home-hero")
    .evaluate(
      (hero) => hero.getBoundingClientRect().height / window.innerHeight,
    );
  expect(heroRatio).toBeGreaterThanOrEqual(0.55);
  expect(heroRatio).toBeLessThanOrEqual(0.65);
  await expect(
    page.getByRole("heading", { name: "新人学习" }),
  ).toBeInViewport();
  await page.evaluate(() => scrollTo(0, 0));
  await expect(page.locator("header")).not.toHaveClass(/compactHeader/);
  const expandedHeaderHeight = await page
    .locator("header")
    .evaluate((header) => header.getBoundingClientRect().height);
  await page.evaluate(() => scrollTo(0, 600));
  await expect(page.locator("header")).toHaveClass(/compactHeader/);
  await expect
    .poll(() =>
      page
        .locator("header")
        .evaluate((header) => header.getBoundingClientRect().height),
    )
    .toBeLessThan(expandedHeaderHeight);
  await page.evaluate(() => scrollTo(0, 0));

  const themeSelector = page.getByRole("combobox", { name: "主题" });
  await themeSelector.selectOption("dark");
  await page.getByRole("button", { name: "应用主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(themeSelector).toHaveValue("dark");
  expect(
    (await page.context().cookies()).find(
      ({ name }) => name === "q_nexus_theme",
    )?.value,
  ).toBe("dark");
  await expect(themeSelector.getByRole("option")).toHaveText([
    "浅色",
    "深色",
    "跟随系统",
  ]);

  await page.keyboard.press("Home");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "品质知识", exact: true })
    .click();
  await expect(page).toHaveURL(/\/quality$/);
  await expect(page.getByRole("heading", { name: "品质知识" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ANOVA" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "品质知识", exact: true }),
  ).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const drawer = page.getByRole("group", { name: "移动端主导航" });
  await expect(drawer).toBeVisible();
  const drawerButton = page.locator('summary[aria-label="打开主导航"]');
  await drawerButton.focus();
  await page.keyboard.press("Enter");
  await expect(drawer).toHaveAttribute("open", "");
  await expect(
    drawer
      .getByRole("navigation", { name: "移动端主导航链接" })
      .getByRole("link"),
  ).toHaveText(expectedNavigation);
  const drawerHeight = await drawerButton.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(drawerHeight).toBeGreaterThanOrEqual(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await drawerButton.click();
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.getByRole("heading", { name: "新人学习" })).toBeVisible();
  await expect(page.getByText("搜索将随知识内容一同开放")).toBeVisible();
  await page.getByRole("link", { name: /新人学习\s*内容建设中/ }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("内容建设中")).toBeVisible();
  const destinationDrawer = page.getByRole("group", { name: "移动端主导航" });
  await destinationDrawer.locator("summary").click();
  await expect(
    destinationDrawer.getByRole("link", { name: "新人专区" }),
  ).toHaveAttribute("aria-current", "page");
  expect(publicNetworkRequests).toEqual([]);
  expect(consoleProblems).toEqual([]);
});
