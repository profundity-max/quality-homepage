import { expect, test } from "@playwright/test";

test("identity lifecycle protects lockout, sessions, revocation, and disabled accounts", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(60_000);
  const loginButton = page.getByRole("button", { name: "登录" });
  await page.goto("/manage?status=active");
  await expect(page).toHaveURL(/\/login\?next=%2Fmanage%3Fstatus%3Dactive$/);
  await expect(
    page.getByRole("heading", { name: "登录品集｜Q Nexus" }),
  ).toBeVisible();

  await page.getByLabel("用户名").fill("unknown-member");
  await page.getByLabel("密码").fill("wrong secret");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码不正确，请重试。")).toBeVisible();

  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await page.getByLabel("用户名").fill("admin");
    await page.getByLabel("密码").fill(`wrong secret ${attempt}`);
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/login"),
    );
    await loginButton.click();
    await response;
    await expect(loginButton).toBeEnabled();
    await expect(page.getByText("用户名或密码不正确，请重试。")).toBeVisible();
  }
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("wrong secret 5");
  const lockResponse = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === "POST" &&
      candidate.url().includes("/login"),
  );
  await loginButton.click();
  await lockResponse;
  await expect(loginButton).toBeEnabled();
  await expect(
    page.getByText("登录尝试过多，账号已暂时锁定，请稍后再试。"),
  ).toBeVisible();
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(
    page.getByText("登录尝试过多，账号已暂时锁定，请稍后再试。"),
  ).toBeVisible();

  await page.waitForTimeout(2_100);

  await page.getByLabel("用户名").fill("  ADMIN  ");
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page).toHaveURL(
    /\/change-password\?next=%2Fmanage%3Fstatus%3Dactive$/,
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.goto("/manage?status=active");
  await expect(page).toHaveURL(
    /\/change-password\?next=%2Fmanage%3Fstatus%3Dactive$/,
  );

  await page.getByLabel("当前密码").fill("correct horse battery staple");
  await page.getByLabel("新密码", { exact: true }).fill("new secure password");
  await page.getByLabel("确认新密码").fill("different secure password");
  await page.getByRole("button", { name: "更新密码" }).click();
  await expect(page.getByText("两次输入的新密码不一致。")).toBeVisible();

  await page.getByLabel("当前密码").fill("correct horse battery staple");
  await page.getByLabel("新密码", { exact: true }).fill("new secure password");
  await page.getByLabel("确认新密码").fill("new secure password");
  await page.getByRole("button", { name: "更新密码" }).click();

  await expect(page).toHaveURL(/\/manage\?status=active$/);
  await expect(page.getByRole("heading", { name: "账户管理" })).toBeVisible();

  const cookies = await context.cookies();
  const sessionCookie = cookies.find(({ name }) => name === "q_nexus_session");
  expect(sessionCookie).toMatchObject({
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });
  expect(sessionCookie?.expires).toBeGreaterThan(Date.now() / 1000 + 6 * 86400);

  await page.goto("/");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("correct horse battery staple");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码不正确，请重试。")).toBeVisible();

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
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  const browserSessionCookie = (await context.cookies()).find(
    ({ name }) => name === "q_nexus_session",
  );
  expect(browserSessionCookie).toMatchObject({
    expires: -1,
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
  });

  const firstMemberContext = await browser.newContext();
  const secondMemberContext = await browser.newContext();
  const firstMemberPage = await firstMemberContext.newPage();
  const secondMemberPage = await secondMemberContext.newPage();
  for (const memberPage of [firstMemberPage, secondMemberPage]) {
    await memberPage.goto("/login");
    await memberPage.getByLabel("用户名").fill("member");
    await memberPage.getByLabel("密码").fill("member secure password");
    await memberPage.getByRole("button", { name: "登录" }).click();
    await expect(memberPage).toHaveURL(/\/$/);
  }

  const revokedAll = await page.request.post("/__e2e__/identity-control", {
    headers: { "x-q-nexus-e2e-control": "browser-test-control" },
    data: { action: "revoke-target" },
  });
  expect(revokedAll.status()).toBe(204);
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await firstMemberPage.goto("/");
  await secondMemberPage.goto("/");
  await expect(firstMemberPage).toHaveURL(/\/login$/);
  await expect(secondMemberPage).toHaveURL(/\/login$/);
  await firstMemberContext.close();
  await secondMemberContext.close();

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  const currentSessionRevoked = await page.request.post(
    "/__e2e__/identity-control",
    {
      headers: { "x-q-nexus-e2e-control": "browser-test-control" },
      data: { action: "revoke-current" },
    },
  );
  expect(currentSessionRevoked.status()).toBe(204);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/login?next=https%3A%2F%2Fattacker.example%2Fsteal");
  await expect(page).toHaveURL(/\/$/);

  await page.waitForTimeout(2_100);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  const disabled = await page.request.post("/__e2e__/identity-control", {
    headers: { "x-q-nexus-e2e-control": "browser-test-control" },
    data: { action: "disable-current" },
  });
  expect(disabled.status()).toBe(204);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page.getByText("用户名或密码不正确，请重试。")).toBeVisible();
});
