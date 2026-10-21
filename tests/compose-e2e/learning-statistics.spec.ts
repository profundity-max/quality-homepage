import { expect, test } from "@playwright/test";

test("standalone proxy accepts same-origin reading heartbeats and rejects cross-origin requests", async ({
  page,
}) => {
  const payload = {
    articleId: "00000000-0000-4000-8000-000000000001",
    tabId: "00000000-0000-4000-8000-000000000002",
    sequence: 1,
    active: true,
  };
  const anonymous = await page.request.post("/api/stats/reading", {
    headers: { Origin: "http://127.0.0.1:8080" },
    data: payload,
  });
  expect(anonymous.status()).toBe(401);
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码").fill("member secure password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const heartbeat = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/stats/reading") &&
      JSON.parse(r.request().postData() ?? "{}").active === true,
  );
  await page.goto("/articles/learning-http-fixture");
  await page.bringToFront();
  await page.locator("[data-reading-article]").scrollIntoViewIfNeeded();
  const response = await heartbeat;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ accepted: true });
  const foreign = await page.request.post("/api/stats/reading", {
    headers: { Origin: "http://foreign.example" },
    data: payload,
  });
  expect(foreign.status()).toBe(403);
});
