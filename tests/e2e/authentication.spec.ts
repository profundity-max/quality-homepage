import { expect, test } from "@playwright/test";

test("administrator can sign in, visit the protected home, and revoke the session on logout", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "登录品集｜Q Nexus" }),
  ).toBeVisible();

  await page.getByLabel("用户名").fill("unknown-member");
  await page.getByLabel("密码").fill("wrong secret");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码不正确，请重试。")).toBeVisible();

  await page.getByLabel("用户名").fill("  ADMIN  ");
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("当前密码").fill("correct horse battery staple");
  await page
    .getByLabel("新密码", { exact: true })
    .fill("correct horse battery staple");
  await page.getByLabel("确认新密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(
    page.getByText("无法更新密码，请检查输入后重试。"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/change-password$/);

  await page.getByLabel("当前密码").fill("correct horse battery staple");
  await page.getByLabel("新密码", { exact: true }).fill("new secure password");
  await page.getByLabel("确认新密码").fill("new secure password");
  await page.getByRole("button", { name: "更新密码" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "品质管理员" })).toBeVisible();
  await expect(page.getByText("管理员 · admin")).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find(({ name }) => name === "q_nexus_session");
  expect(sessionCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(sessionCookie?.value).toBeTruthy();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await context.addCookies([
    {
      name: "q_nexus_session",
      value: sessionCookie!.value,
      url: "http://127.0.0.1:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});
