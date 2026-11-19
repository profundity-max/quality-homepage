import { expect, test, type Page } from "@playwright/test";

async function fieldHash(page: Page) {
  return page
    .locator("[data-login-screen] canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const pixels = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 2166136261;
      for (let index = 0; index < pixels.length; index += 97)
        hash = Math.imul(hash ^ pixels[index]!, 16777619) >>> 0;
      return hash;
    });
}

test("statistical background fills the viewport, moves, pauses and respects reduced motion", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/login?next=%2Fmanage");
  const field = page.locator("[data-motion]");
  await expect(field).toHaveAttribute("data-motion", "running");
  for (const width of [320, 768, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() =>
        field.evaluate((node) => {
          const rect = node.getBoundingClientRect();
          return {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
          };
        }),
      )
      .toEqual({
        left: 0,
        top: 0,
        width,
        height: 900,
        viewportWidth: width,
        viewportHeight: 900,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const initial = await fieldHash(page);
  await expect.poll(() => fieldHash(page)).not.toBe(initial);
  await page.getByRole("button", { name: "暂停背景动画" }).click();
  await expect(field).toHaveAttribute("data-motion", "paused");
  const paused = await fieldHash(page);
  await page.waitForTimeout(200);
  expect(await fieldHash(page)).toBe(paused);
  await page.getByRole("button", { name: "播放背景动画" }).click();
  await expect(field).toHaveAttribute("data-motion", "running");
  await expect.poll(() => fieldHash(page)).not.toBe(paused);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(field).toHaveAttribute("data-motion", "reduced");
  await expect(page.getByRole("button", { name: "暂停背景动画" })).toBeHidden();
  const still = await fieldHash(page);
  await page.waitForTimeout(200);
  expect(await fieldHash(page)).toBe(still);
  await page.getByLabel("用户名").fill("preview-member");
  await page.getByLabel("密码", { exact: true }).fill("preview-only");
  await page.getByRole("button", { name: "显示输入内容" }).click();
  await expect(page.locator("#login-password")).toHaveAttribute("type", "text");
  await expect(page.locator('input[name="next"]')).toHaveValue("/manage");
});

test("statistical fallback and login remain visible without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:3000/login");
  await expect(
    page.locator('[data-login-screen] svg[viewBox="0 0 1440 900"]'),
  ).toBeVisible();
  await expect(page.getByLabel("用户名")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "登录", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "暂停背景动画" })).toBeHidden();
  await context.close();
});

test("statistical field remains painted beneath the welcome text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");
  await expect(page.locator("[data-motion]")).toHaveAttribute(
    "data-ready",
    "true",
  );
  const visiblePixels = await page
    .locator("[data-login-screen] canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const heading = document
        .querySelector("#login-heading")!
        .getBoundingClientRect();
      const scale = canvas.width / innerWidth;
      const pixels = canvas
        .getContext("2d")!
        .getImageData(
          Math.ceil(heading.left * scale),
          Math.ceil(heading.top * scale),
          Math.floor(heading.width * scale),
          Math.floor(heading.height * scale),
        ).data;
      let count = 0;
      for (let index = 3; index < pixels.length; index += 4)
        if (pixels[index]! >= 2) count += 1;
      return count;
    });
  expect(visiblePixels).toBeGreaterThan(100);
});
