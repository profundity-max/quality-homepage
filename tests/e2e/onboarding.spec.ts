import { expect, test } from "@playwright/test";

async function loginAsMember(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("onboarding shows the six-stage overview and stage navigation", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/onboarding");

  // 六阶段总览
  const overview = page.getByLabel("新人路线总览");
  await expect(overview).toContainText("入职第一天");
  await expect(overview).toContainText("培训与试用期");

  // 默认显示第一阶段
  await expect(page.getByLabel("当前阶段")).toContainText("入职第一天");
  await expect(page.getByText("第 1 阶段 / 共 6 阶段")).toBeVisible();

  // 下一篇导航
  await page.getByRole("link", { name: "下一篇 →" }).click();
  await expect(page.getByLabel("当前阶段")).toContainText("认识品质工作");
  await expect(page.getByText("第 2 阶段 / 共 6 阶段")).toBeVisible();
});

test("work-principles stage shows the four principles (ONB-02)", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/onboarding?stage=work-principles");

  await expect(page.getByLabel("当前阶段")).toContainText("Reality > Opinion");
  await expect(page.getByLabel("当前阶段")).toContainText(
    "Ownership > Explanation",
  );
  await expect(page.getByLabel("当前阶段")).toContainText(
    "Early Exposure > Late Fix",
  );
  await expect(page.getByLabel("当前阶段")).toContainText("System > Hero");
});

test("onboarding works at 390px", async ({ page }) => {
  await loginAsMember(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/onboarding");

  await expect(page.getByLabel("新人路线总览")).toBeVisible();
  await page.getByRole("link", { name: "下一篇 →" }).click();
  await expect(page.getByLabel("当前阶段")).toContainText("认识品质工作");
});
