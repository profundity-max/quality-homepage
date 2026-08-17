import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("template center lists categories and published templates", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/templates");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("模板中心");
  await expect(page.getByLabel("演示分类")).toContainText("演示检验记录表");
  await expect(page.getByLabel("演示分类")).toContainText("v1.0");
});

test("template detail shows fields and QMS notice (TPL-11/12)", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/templates/demo-template");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "演示检验记录表",
  );
  await expect(page.getByText("Excel")).toBeVisible();
  await expect(page.getByText("2.0 KB")).toBeVisible();
  await expect(page.getByText(/QMS 正式受控版本/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "下载当前有效版本" }),
  ).toHaveAttribute("href", "/templates/demo-template/download");
});

test("template center works at 390px", async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/templates");
  await expect(page.getByLabel("演示分类")).toBeVisible();
});
