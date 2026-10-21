import { expect, test } from "@playwright/test";

test("administrator reading is actually collected and exported through authenticated HTTP", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/login");
  await page.getByLabel("用户名").fill("columnadmin");
  await page.getByLabel("密码").fill("column admin secure password");
  await page.getByLabel("保持登录 7 天").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  let accepted = 0;
  const failures: number[] = [];
  page.on("response", async (response) => {
    if (
      response.url().endsWith("/api/stats/reading") &&
      response.request().method() === "POST"
    ) {
      if (response.status() !== 200) failures.push(response.status());
      else if (
        JSON.parse(response.request().postData() ?? "{}").active === true &&
        (await response.json()).accepted
      )
        accepted++;
    }
  });
  await page.goto("/articles/anova-intro");
  await page.bringToFront();
  await page.locator("[data-reading-article]").scrollIntoViewIfNeeded();
  await expect
    // Dev Strict Mode mounts twice; allow the short first lease to settle and
    // collect enough real server-clock intervals to exceed the 30s threshold.
    .poll(() => accepted, { timeout: 80_000, intervals: [1000] })
    .toBeGreaterThanOrEqual(7);
  expect(failures).toEqual([]);
  await page.goto("/manage/stats?view=people&q=columnadmin");
  const row = page
    .getByRole("region", { name: "人员统计", exact: true })
    .locator("tbody tr")
    .first();
  expect(Number(await row.locator("td").nth(3).innerText())).toBeGreaterThan(0);
  expect(await row.locator("td").nth(5).innerText()).not.toBe("0分0秒");
  const download = await page.request.get(
    "/api/stats/people-export?period=month&q=columnadmin",
  );
  expect(download.status()).toBe(200);
  expect(download.headers()["content-type"]).toContain("spreadsheetml");
  expect(download.headers()["cache-control"]).toContain("no-store");
  expect((await download.body()).subarray(0, 2).toString()).toBe("PK");
  await page.goto("/manage/audit");
  await expect(
    page.getByText("人员学习汇总导出", { exact: true }).first(),
  ).toBeVisible();
});
