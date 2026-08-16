import { expect, test, type Page } from "@playwright/test";

test("identity lifecycle protects lockout, sessions, revocation, and disabled accounts", async ({
  browser,
  context,
  page,
}) => {
  test.setTimeout(240_000);
  const consoleProblems: string[] = [];
  monitorConsole(page, consoleProblems);
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

  await page.waitForTimeout(10_100);

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

  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/manage");
  const administratorCard = page
    .getByRole("article")
    .filter({ hasText: "@admin" });
  await administratorCard.getByRole("button", { name: "禁用 admin" }).click();
  await expect(
    page.getByText("不能禁用当前登录账号。", { exact: true }),
  ).toBeVisible();
  // seed 里存在第二个管理员（columnadmin），先将其降级（此时 admin 仍在，
  // 降级应成功），使 admin 成为最后一位有效管理员后再断言拒绝降级。
  const columnAdminCard = page
    .getByRole("article")
    .filter({ hasText: "@columnadmin" });
  await columnAdminCard
    .getByLabel("调整 columnadmin 的角色")
    .selectOption("reader");
  await columnAdminCard.getByRole("button", { name: "更新角色" }).click();
  await administratorCard
    .getByLabel("调整 admin 的角色")
    .selectOption("reader");
  await administratorCard.getByRole("button", { name: "更新角色" }).click();
  await expect(
    page.getByText("必须保留至少一位有效管理员。", { exact: true }),
  ).toBeVisible();

  const createAccountRegion = page.getByRole("region", {
    name: "创建账号",
  });
  await createAccountRegion.getByLabel("用户名").fill("managed-member");
  await createAccountRegion.getByLabel("显示名称").fill("受管成员");
  await createAccountRegion
    .getByRole("combobox", { name: "角色" })
    .selectOption("reader");
  await createAccountRegion
    .getByLabel("临时密码", { exact: true })
    .fill("initial managed password");
  await createAccountRegion.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByText("账号已创建。")).toBeVisible();
  await expect(page).not.toHaveURL(/initial managed password/);
  await expect(page.locator("body")).not.toContainText(
    "initial managed password",
  );

  const managedContext = await browser.newContext();
  const managedPage = await managedContext.newPage();
  monitorConsole(managedPage, consoleProblems);
  await managedPage.goto("/login");
  await managedPage.getByLabel("用户名").fill("managed-member");
  await managedPage.getByLabel("密码").fill("initial managed password");
  await managedPage.getByRole("button", { name: "登录" }).click();
  await expect(managedPage).toHaveURL(/\/change-password$/);
  await managedPage.getByLabel("当前密码").fill("initial managed password");
  await managedPage
    .getByLabel("新密码", { exact: true })
    .fill("lasting managed password");
  await managedPage.getByLabel("确认新密码").fill("lasting managed password");
  await managedPage.getByRole("button", { name: "更新密码" }).click();
  await expect(managedPage).toHaveURL(/\/$/);
  await managedPage.goto("/manage");
  await expect(managedPage).toHaveURL(/\/$/);

  await page.goto("/manage");
  const managedCard = page
    .getByRole("article")
    .filter({ hasText: "@managed-member" });
  await managedCard
    .getByLabel("调整 managed-member 的角色")
    .selectOption("editor");
  await managedCard.getByRole("button", { name: "更新角色" }).click();
  await expect(page.getByText("账号角色已更新。")).toBeVisible();
  await managedPage.goto("/manage");
  await expect(managedPage).toHaveURL(/\/$/);

  await page.goto("/manage");
  await managedCard
    .getByLabel("重置 managed-member 的临时密码")
    .fill("reset managed password");
  await managedCard.getByRole("button", { name: "重置密码" }).click();
  await expect(page.getByText("临时密码已重置，原会话已撤销。")).toBeVisible();
  await managedPage.goto("/");
  await expect(managedPage).toHaveURL(/\/login$/);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await managedPage.getByLabel("用户名").fill("managed-member");
    await managedPage
      .getByLabel("密码")
      .fill(`wrong reset password ${attempt}`);
    const response = managedPage.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/login"),
    );
    await managedPage.getByRole("button", { name: "登录" }).click();
    await response;
    await expect(
      managedPage.getByRole("button", { name: "登录" }),
    ).toBeEnabled();
  }
  await expect(
    managedPage.getByText("登录尝试过多，账号已暂时锁定，请稍后再试。"),
  ).toBeVisible();
  await page.goto("/manage");
  await managedCard
    .getByRole("button", { name: "解除 managed-member 的锁定" })
    .click();
  await expect(page.getByText("账号已解除锁定。")).toBeVisible();

  await managedPage.getByLabel("用户名").fill("managed-member");
  await managedPage.getByLabel("密码").fill("reset managed password");
  await managedPage.getByRole("button", { name: "登录" }).click();
  await expect(managedPage).toHaveURL(/\/change-password$/);
  await page.goto("/manage");
  await managedCard
    .getByRole("button", { name: "禁用 managed-member" })
    .click();
  await expect(page.getByText("账号已禁用，原会话已撤销。")).toBeVisible();
  await managedPage.goto("/");
  await expect(managedPage).toHaveURL(/\/login$/);
  await managedPage.getByLabel("用户名").fill("managed-member");
  await managedPage.getByLabel("密码").fill("reset managed password");
  await managedPage.getByRole("button", { name: "登录" }).click();
  await expect(
    managedPage.getByText("用户名或密码不正确，请重试。"),
  ).toBeVisible();
  await managedContext.close();

  const firstMemberContext = await browser.newContext();
  const secondMemberContext = await browser.newContext();
  const firstMemberPage = await firstMemberContext.newPage();
  const secondMemberPage = await secondMemberContext.newPage();
  monitorConsole(firstMemberPage, consoleProblems);
  monitorConsole(secondMemberPage, consoleProblems);
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

  await page.setViewportSize({ width: 390, height: 844 });
  await logoutFromMobile(page);
  await page.getByLabel("用户名").fill("admin");
  await page.getByLabel("密码").fill("new secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/manage");
  await expect(page.getByRole("heading", { name: "账户管理" })).toBeVisible();

  const mobileAccountRegion = page.getByRole("region", { name: "创建账号" });
  await mobileAccountRegion.getByLabel("用户名").fill("mobile-member");
  await mobileAccountRegion.getByLabel("显示名称").fill("移动品质成员");
  await mobileAccountRegion
    .getByRole("combobox", { name: "角色" })
    .selectOption("reader");
  await mobileAccountRegion
    .getByLabel("临时密码", { exact: true })
    .fill("temporary mobile password");
  await mobileAccountRegion.getByRole("button", { name: "创建账号" }).click();
  await expect(page.getByText("账号已创建。")).toBeVisible();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobilePage = await mobileContext.newPage();
  monitorConsole(mobilePage, consoleProblems);
  await mobilePage.goto("/login");
  await mobilePage.getByLabel("用户名").fill("mobile-member");
  await mobilePage.getByLabel("密码").fill("temporary mobile password");
  await mobilePage.getByLabel("保持登录 7 天").check();
  await mobilePage.getByRole("button", { name: "登录" }).click();
  await expect(mobilePage).toHaveURL(/\/change-password$/);
  await mobilePage.getByLabel("当前密码").fill("temporary mobile password");
  await mobilePage
    .getByLabel("新密码", { exact: true })
    .fill("lasting mobile password");
  await mobilePage.getByLabel("确认新密码").fill("lasting mobile password");
  await mobilePage.getByRole("button", { name: "更新密码" }).click();
  await expect(
    mobilePage.getByRole("heading", { name: "移动品质成员" }),
  ).toBeVisible();

  const themeDrawer = await openMobileDrawer(mobilePage);
  await themeDrawer
    .getByRole("combobox", { name: "主题" })
    .selectOption("dark");
  await themeDrawer.getByRole("button", { name: "应用主题" }).click();
  await expect(mobilePage.locator("html")).toHaveAttribute(
    "data-theme",
    "dark",
  );
  await logoutFromMobile(mobilePage);
  await mobilePage.getByLabel("用户名").fill("mobile-member");
  await mobilePage.getByLabel("密码").fill("lasting mobile password");
  await mobilePage.getByRole("button", { name: "登录" }).click();
  await expect(
    mobilePage.getByRole("heading", { name: "移动品质成员" }),
  ).toBeVisible();
  await logoutFromMobile(mobilePage);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await mobilePage.getByLabel("用户名").fill("mobile-member");
    await mobilePage
      .getByLabel("密码")
      .fill(`wrong mobile password ${attempt}`);
    const response = mobilePage.waitForResponse(
      (candidate) =>
        candidate.request().method() === "POST" &&
        candidate.url().includes("/login"),
    );
    await mobilePage.getByRole("button", { name: "登录" }).click();
    await response;
    await expect(
      mobilePage.getByRole("button", { name: "登录" }),
    ).toBeEnabled();
  }
  await expect(
    mobilePage.getByText("登录尝试过多，账号已暂时锁定，请稍后再试。"),
  ).toBeVisible();

  await page.goto("/manage");
  const mobileMemberCard = page
    .getByRole("article")
    .filter({ hasText: "@mobile-member" });
  await mobileMemberCard
    .getByRole("button", { name: "解除 mobile-member 的锁定" })
    .click();
  await expect(page.getByText("账号已解除锁定。")).toBeVisible();
  await mobileMemberCard
    .getByLabel("调整 mobile-member 的角色")
    .selectOption("editor");
  await mobileMemberCard.getByRole("button", { name: "更新角色" }).click();
  await expect(page.getByText("账号角色已更新。")).toBeVisible();

  await mobilePage.getByLabel("用户名").fill("mobile-member");
  await mobilePage.getByLabel("密码").fill("lasting mobile password");
  await mobilePage.getByRole("button", { name: "登录" }).click();
  await expect(
    mobilePage.getByRole("heading", { name: "移动品质成员" }),
  ).toBeVisible();
  await logoutFromMobile(mobilePage);
  await mobileContext.close();

  expect(consoleProblems).toEqual([]);
});

function monitorConsole(page: Page, problems: string[]) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
}

async function openMobileDrawer(page: Page) {
  const drawer = page.getByRole("group", { name: "移动端主导航" });
  if ((await drawer.getAttribute("open")) === null) {
    await drawer.locator("summary").click();
  }
  return drawer;
}

async function logoutFromMobile(page: Page) {
  const drawer = await openMobileDrawer(page);
  await drawer.getByRole("button", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login$/);
}
