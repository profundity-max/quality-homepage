import { expect, test } from "@playwright/test";

test("物资追溯应用只接受品集签名入口并在 SSO 后加载", async ({
  page,
  request,
}) => {
  const anonymous = await request.get("/wz/", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(302);
  expect(anonymous.headers().location).toBe(
    "/login?next=%2Fapps%2Fwuzhi-trace",
  );

  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/apps/wuzhi-trace");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("link", { name: "打开物资追溯系统" }).click();
  const application = await popupPromise;
  await application.waitForLoadState("domcontentloaded");

  await expect(application).toHaveURL(/\/wz\/#tab=dashboard$/);
  await expect(
    application.getByRole("heading", {
      name: "物资申领与消耗追溯 V1.1.1",
    }),
  ).toBeVisible();
  await expect(application.locator("#meName")).toHaveText(
    "品质成员 · 区域领用人",
  );
  await expect
    .poll(async () =>
      application.evaluate(
        () =>
          (
            window as unknown as {
              WZ?: { SYNC?: { authMode?: string } };
            }
          ).WZ?.SYNC?.authMode ?? "",
      ),
    )
    .toBe("qnexus");
  await expect
    .poll(async () =>
      application.evaluate(
        () =>
          (
            window as unknown as {
              WZ?: { SYNC?: { admin?: boolean } };
            }
          ).WZ?.SYNC?.admin ?? null,
      ),
    )
    .toBe(false);
});
