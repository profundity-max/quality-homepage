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

test("selected cover gallery filters real categories and preserves browser history", async ({
  page,
}) => {
  await page.goto("/books");
  const nav = page.getByRole("navigation", { name: "书单分类" });
  await expect(
    nav.getByRole("link", { name: "全部", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const initialCount = await page.locator("main li").count();
  expect(initialCount).toBeGreaterThan(0);
  await nav.getByRole("link", { name: "演示书分类", exact: true }).click();
  await expect(page).toHaveURL(/category=demo-book-cat/);
  await expect(
    page
      .getByRole("region", { name: "演示书分类" })
      .getByRole("heading", { name: "演示：品质管理基础", exact: true }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "统计与数据", exact: true }).click();
  await expect(
    page.getByText("该分类暂无书籍。", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("main li")).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(/category=demo-book-cat/);
  await expect(
    nav.getByRole("link", { name: "演示书分类", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav.getByRole("link", { name: "全部", exact: true }).click();
  await expect(page.locator("main li")).toHaveCount(initialCount);
  await page.goto("/books?category=does-not-exist");
  await expect(
    nav.getByRole("link", { name: "全部", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("gallery has responsive columns and readable light and dark states", async ({
  page,
  context,
}) => {
  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "q_nexus_theme", value: theme, url: "http://127.0.0.1:3000" },
    ]);
    for (const [width, columns] of [
      [320, 1],
      [375, 2],
      [768, 3],
      [1440, 4],
    ]) {
      await page.setViewportSize({ width, height: 1050 });
      await page.goto("/books");
      const gallery = page.getByRole("list", { name: "推荐书籍" });
      const tracks = await gallery.evaluate(
        (node) => getComputedStyle(node).gridTemplateColumns.split(" ").length,
      );
      expect(tracks).toBe(columns);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(
      results.violations.filter((v) =>
        ["critical", "serious"].includes(v.impact ?? ""),
      ),
    ).toEqual([]);
  }
});
