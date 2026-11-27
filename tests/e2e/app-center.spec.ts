import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function loginAsMember(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("member secure password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("application center opens BOF guidance and protected tool", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/apps");

  await expect(
    page.getByRole("heading", { level: 1, name: "应用中心" }),
  ).toBeVisible();
  const applicationCard = page.getByRole("link", {
    name: /BOF 箱线图与散点图/,
  });
  await expect(applicationCard).toBeVisible();
  await applicationCard.click();

  await expect(page).toHaveURL(/\/apps\/bof-boxplot$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "BOF 箱线图与散点图" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "四步完成分析" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "下载案例工作簿" }),
  ).toHaveAttribute("href", "/apps/bof-boxplot/template");
  await expect(page.getByRole("link", { name: "打开工具" })).toHaveAttribute(
    "href",
    "/apps/bof-boxplot/run",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "下载案例工作簿" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("BOF箱线图分析案例数据.xlsx");

  await page.goto("/apps/bof-boxplot/run");
  await expect(
    page.getByRole("heading", { level: 1, name: "BOF 箱线图与散点图 V1.3" }),
  ).toBeVisible();
  await expect(page.locator("#workbook-file")).toBeAttached();
  await expect(page.getByText("文件只在本机浏览器处理")).toBeVisible();
});

test("BOF sample workbook runs end to end in the hosted application", async ({
  page,
}) => {
  await loginAsMember(page);
  const downloadPromise = page.waitForEvent("download");
  await page.goto("/apps/bof-boxplot");
  await page.getByRole("link", { name: "下载案例工作簿" }).click();
  const download = await downloadPromise;
  const samplePath = await download.path();
  expect(samplePath).toBeTruthy();

  await page.goto("/apps/bof-boxplot/run");
  await page.locator("#workbook-file").setInputFiles(samplePath!);
  await page.waitForFunction(
    () => document.body.dataset.rendered === "true",
    null,
    { timeout: 30_000 },
  );
  await expect(page.locator(".chart-card")).toHaveCount(4);
  await expect(page.locator(".bof-bin-band")).toHaveCount(3);
  await expect(page.locator(".bof-bin-cut")).toHaveCount(3);
  await expect(page.locator(".bof-spec-limit")).toHaveCount(6);
  await expect(page.locator(".spec-legend")).toHaveCount(3);
  await expect(page.locator(".chart-card h2")).toHaveText([
    "Group A",
    "Group B",
    "尺寸 D",
    "尺寸 E",
  ]);
  await expect(page.locator(".bof-point-normal").first()).toHaveAttribute(
    "data-sn",
    "SN-BOF-001",
  );
});

test("CQE yield site is reachable only through a signed portal launch", async ({
  page,
}) => {
  await loginAsMember(page);
  await page.goto("/apps");

  const card = page.getByRole("link", { name: /CQE 测试线良率分析/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/apps\/cqe-yield-analysis$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "CQE 测试线良率分析" }),
  ).toBeVisible();
  await expect(page.getByText("禁止直接访问")).toBeVisible();
  await expect(page.getByText("使用品集身份免登录")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开良率分析网站" }),
  ).toHaveAttribute("href", "/apps/cqe-yield-analysis/launch");

  const launch = await page.request.get("/apps/cqe-yield-analysis/launch", {
    maxRedirects: 0,
  });
  expect(launch.status()).toBe(302);
  const location = launch.headers().location;
  expect(location).toBeTruthy();
  const target = new URL(location!);
  expect(target.origin).toBe("https://127.0.0.1:8504");
  expect(target.pathname).toBe("/__qnexus_entry");
  expect(target.searchParams.get("next")).toBe("/yield-trend");
  const token = target.searchParams.get("token");
  expect(token).toBeTruthy();

  const access = await page.request.get("/api/apps/cqe-yield-analysis/access", {
    headers: { "x-q-nexus-grant": token! },
  });
  expect(access.status()).toBe(204);
  expect(access.headers()["x-q-nexus-role"]).toBeTruthy();
  expect(access.headers()["x-q-nexus-subject"]).toBeTruthy();
});

test("物资追溯应用只能通过品集签名入口进入", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/apps");

  const card = page.getByRole("link", { name: /物资申领与消耗追溯/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page).toHaveURL(/\/apps\/wuzhi-trace$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "物资申领与消耗追溯" }),
  ).toBeVisible();
  await expect(page.getByText("可追溯边界")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "打开物资追溯系统" }),
  ).toHaveAttribute("href", "/apps/wuzhi-trace/launch");

  const launch = await page.request.get("/apps/wuzhi-trace/launch", {
    maxRedirects: 0,
  });
  expect(launch.status()).toBe(302);
  const location = launch.headers().location;
  expect(location).toBeTruthy();
  const target = new URL(location!);
  expect(target.origin).toBe("http://127.0.0.1:3000");
  expect(target.pathname).toBe("/wz/__qnexus_entry");
  const token = target.searchParams.get("token");
  expect(token).toBeTruthy();

  const access = await page.request.get("/api/apps/wuzhi-trace/access", {
    headers: { "x-q-nexus-grant": token! },
  });
  expect(access.status()).toBe(204);
  expect(access.headers()["x-q-nexus-role"]).toBeTruthy();
  expect(access.headers()["x-q-nexus-subject"]).toBeTruthy();
});

test("IPQC 时效看板通过登录态入口跳转", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/apps");

  const card = page.getByRole("link", { name: /IPQC 时效看板/ });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/apps/ipqc-timeliness/launch");

  const launch = await page.request.get("/apps/ipqc-timeliness/launch", {
    maxRedirects: 0,
  });
  expect(launch.status()).toBe(302);
  expect(launch.headers().location).toBe(
    "http://192.168.87.214:30112/quality/ipqc-timeliness",
  );
});

test("SPC CTQ 数据图通过登录态入口跳转", async ({ page }) => {
  await loginAsMember(page);
  await page.goto("/apps");

  const card = page.getByRole("link", { name: /SPC CTQ 数据图/ });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("href", "/apps/spc-ctq-monitor/launch");

  const launch = await page.request.get("/apps/spc-ctq-monitor/launch", {
    maxRedirects: 0,
  });
  expect(launch.status()).toBe(302);
  expect(launch.headers().location).toBe(
    "http://192.168.88.11:7777/ProcessSPCMonitor",
  );
});

test("application center has responsive layout and no serious accessibility issues", async ({
  page,
  context,
}) => {
  await loginAsMember(page);
  for (const theme of ["light", "dark"]) {
    await context.addCookies([
      { name: "q_nexus_theme", value: theme, url: "http://127.0.0.1:3000" },
    ]);
    for (const width of [320, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        "/apps",
        "/apps/bof-boxplot",
        "/apps/cqe-yield-analysis",
        "/apps/wuzhi-trace",
      ]) {
        await page.goto(path);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${theme} ${width} ${path}`,
        ).toBe(true);
      }
    }
  }

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    results.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
});
