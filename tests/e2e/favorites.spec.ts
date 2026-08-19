import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("reader favorites and unfavorites an article; favorites are personal (FAV-01)", async ({
  page,
}) => {
  await login(page);

  await page.goto("/articles/anova-intro");
  const favoriteButton = page.getByRole("button", { name: "收藏" });
  await favoriteButton.click();
  await expect(page.getByRole("button", { name: "取消收藏" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  await page.goto("/favorites");
  await expect(
    page.getByRole("heading", { level: 1, name: "收藏" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /ANOVA 入门/ })).toBeVisible();

  await page.goto("/articles/anova-intro");
  await page.getByRole("button", { name: "取消收藏" }).click();
  await expect(page.getByRole("button", { name: "收藏" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await page.goto("/favorites");
  await expect(page.getByText("还没有收藏文章")).toBeVisible();
});

test("favorites list is empty for a fresh reader (FAV-01/02)", async ({
  page,
}) => {
  await login(page);
  await page.goto("/favorites");
  await expect(page.getByText("还没有收藏文章")).toBeVisible();
  await expect(page.getByText("最近阅读", { exact: false })).not.toBeVisible();
});
