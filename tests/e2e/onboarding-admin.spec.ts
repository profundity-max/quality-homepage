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

test("administrator updates a stage and adds a step; member sees the changes", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/onboarding");

  // ONB-08：调整阶段说明
  const description = page.getByLabel("阶段说明 入职第一天");
  await description.fill("了解部门、岗位与工作环境；含安全须知。");
  await description
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "保存说明" })
    .click();
  await expect(page.getByRole("status")).toContainText("阶段说明已更新");
  await expect(description).toHaveValue(
    "了解部门、岗位与工作环境；含安全须知。",
  );

  // ONB-03/08：新增步骤引用已发布文章
  const addTitle = page.getByLabel("新增步骤标题 入职第一天");
  await addTitle.fill("阅读 ANOVA 入门");
  await page.getByLabel("新增步骤文章 入职第一天").fill("anova-intro");
  await addTitle
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "添加步骤" })
    .click();
  await expect(page.getByRole("status")).toContainText("步骤已添加");
  await expect(page.getByText("阅读 ANOVA 入门")).toBeVisible();

  // 阅读者视角能看到管理端调整后的内容
  await page.getByRole("button", { name: "退出登录" }).click();
  await login(page, "member", "member secure password");
  await page.goto("/onboarding");
  await expect(page.getByLabel("当前阶段")).toContainText(
    "了解部门、岗位与工作环境；含安全须知。",
  );
  await expect(page.getByLabel("当前阶段")).toContainText("阅读 ANOVA 入门");
});

test("invalid step reference is refused with a clear error", async ({
  page,
}) => {
  await login(page, "columnadmin", "column admin secure password");
  await page.goto("/manage/onboarding");

  const addTitle = page.getByLabel("新增步骤标题 入职第一天");
  await addTitle.fill("引用不存在的文章");
  await page.getByLabel("新增步骤文章 入职第一天").fill("no-such-article");
  await addTitle
    .locator("xpath=ancestor::form")
    .getByRole("button", { name: "添加步骤" })
    .click();
  await expect(page.getByText("引用的文章不存在或未发布。")).toBeVisible();
});

test("editor cannot access onboarding management", async ({ page }) => {
  await login(page, "editor", "editor secure password");
  await page.goto("/manage/onboarding");
  await expect(page).not.toHaveURL(/\/manage\/onboarding$/);
});
