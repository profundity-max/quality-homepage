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
    page.getByRole("heading", { level: 1, name: "BOF 箱线图与散点图 V1.2" }),
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
  await expect(page.locator(".chart-card")).toHaveCount(2);
  await expect(page.locator(".bof-bin-band")).toHaveCount(0);
  await expect(page.locator(".bof-bin-cut")).toHaveCount(0);
  await expect(page.locator(".bof-spec-limit")).toHaveCount(8);
  await expect(page.getByText("仅显示 Spec 上下限").first()).toBeVisible();
  await expect(page.locator(".bof-point-normal").first()).toHaveAttribute(
    "data-sn",
    "SN-BOF-001",
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
      for (const path of ["/apps", "/apps/bof-boxplot"]) {
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
