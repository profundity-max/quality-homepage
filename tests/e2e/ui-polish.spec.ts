import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("login keeps credentials in a natural keyboard order and lets people reveal the password", async ({
  page,
}) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "欢迎来到品集｜Q Nexus",
  );

  const headingLineGap = await page
    .locator("#login-heading")
    .evaluate((heading) => {
      const [welcomeLine, productLine] = Array.from(heading.children);
      return (
        productLine.getBoundingClientRect().top -
        welcomeLine.getBoundingClientRect().bottom
      );
    });
  expect(headingLineGap).toBeGreaterThanOrEqual(6);

  const username = page.getByLabel("用户名");
  const password = page.getByLabel("密码");
  const revealPassword = page.getByRole("button", { name: "显示输入内容" });
  const persistent = page.getByLabel("保持登录 7 天");

  await username.focus();
  await page.keyboard.press("Tab");
  await expect(password).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(revealPassword).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(persistent).toBeFocused();

  await password.fill("member secure password");
  await expect(password).toHaveAttribute("type", "password");
  await revealPassword.click();
  await expect(password).toHaveAttribute("type", "text");
  await expect(
    page.getByRole("button", { name: "隐藏输入内容" }),
  ).toBeVisible();
});

test("quick search opens from the keyboard, traps focus, and restores the page", async ({
  page,
}) => {
  await login(page);

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速搜索" });
  const input = dialog.getByLabel("搜索知识");
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");
  const dialogCenterOffset = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return Math.abs(box.left + box.width / 2 - window.innerWidth / 2);
  });
  expect(dialogCenterOffset).toBeLessThan(2);

  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("link", { name: "查看全部" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: /^搜索知识/ })).toBeFocused();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
});

test("editorial sections reveal once they enter the viewport", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => scrollTo(0, 0));

  const firstSection = page.locator('[data-graphic="onboarding"]');
  const laterSection = page.locator('[data-graphic="thermal"]');
  await expect(firstSection).toHaveAttribute("data-motion-state", "visible");
  await expect(laterSection).toHaveAttribute("data-motion-state", "hidden");

  await laterSection.scrollIntoViewIfNeeded();
  await expect(laterSection).toHaveAttribute("data-motion-state", "visible");
  await expect
    .poll(() =>
      laterSection.evaluate((section) =>
        Number.parseFloat(getComputedStyle(section).opacity),
      ),
    )
    .toBe(1);
});

test("dark home entrance motion preserves readable text contrast", async ({
  page,
}) => {
  await login(page);
  const themeApplied = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/",
  );
  await page.getByRole("button", { name: "切换到深色模式" }).click();
  await themeApplied;
  await page.reload();

  const violations = (
    await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze()
  ).violations;

  expect(violations).toEqual([]);
});
