import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("the production stack serves login and home without public requests", async ({
  page,
}) => {
  const consoleProblems: string[] = [];
  const publicRequests: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(message.text());
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).hostname !== "127.0.0.1") {
      publicRequests.push(request.url());
    }
  });

  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByRole("heading", { name: "品质成员" })).toBeVisible();
  await page.getByRole("combobox", { name: "主题" }).selectOption("dark");
  const themeApplied = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/",
  );
  await page.getByRole("button", { name: "应用主题" }).click();
  await themeApplied;
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const drawer = page.getByRole("group", { name: "移动端主导航" });
  await drawer.locator("summary").click();
  await expect(drawer.getByRole("link", { name: "新人专区" })).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await drawer.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(publicRequests).toEqual([]);
  expect(consoleProblems).toEqual([]);
});
