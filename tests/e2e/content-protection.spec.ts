import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, role: "member" | "editor" | "columnadmin") {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(role);
  await page
    .getByLabel("密码", { exact: true })
    .fill(
      role === "columnadmin"
        ? "column admin secure password"
        : `${role} secure password`,
    );
  await page.getByLabel("保持登录").check();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test("reader protection covers detail, inline reading and print without blocking feedback", async ({
  page,
}) => {
  await login(page, "member");
  await page.goto("/articles/anova-example");
  const content = page.locator("[data-content-protection]").last();
  await expect(content).toHaveAttribute(
    "data-watermark",
    /天脉品集 Q-Nexus · 内部资料 · .*（member）· \d{4}-\d{2}-\d{2}/,
  );
  await expect(content).toHaveAttribute("data-restrict-copy", "true");
  await expect(content.locator("table")).toBeVisible();
  await expect(content.locator(".katex").first()).toBeVisible();
  // 等待客户端事件监听挂载，不依赖水印的服务器 HTML 就开始派发事件。
  await page.getByText("内容反馈", { exact: true }).click();
  const feedback = page.getByLabel("说明", { exact: true });
  await feedback.fill("工作中需要补充的说明");
  const result = await content.evaluate((root) => {
    const target = root.querySelector("p")!;
    const operations = ["copy", "cut", "contextmenu", "dragstart"].map(
      (type) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
        return event.defaultPrevented;
      },
    );
    // Ctrl+A 或从正文外开始的选区仍然覆盖正文。
    const range = document.createRange();
    range.selectNode(document.querySelector("main")!);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const outside = new Event("copy", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(outside);
    const outsideDrag = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(outsideDrag);
    const input = document.querySelector("textarea")!;
    const inputCopy = new Event("copy", { bubbles: true, cancelable: true });
    input.dispatchEvent(inputCopy);
    selection.removeAllRanges();
    const globalCopy = new Event("copy", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(globalCopy);
    return {
      operations,
      outside: outside.defaultPrevented,
      outsideDrag: outsideDrag.defaultPrevented,
      input: inputCopy.defaultPrevented,
      global: globalCopy.defaultPrevented,
    };
  });
  expect(result).toEqual({
    operations: [true, true, true, true],
    outside: true,
    outsideDrag: true,
    input: false,
    global: false,
  });
  await expect(feedback).toHaveValue("工作中需要补充的说明");
  await page.screenshot({
    path: "test-results/content-protection-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("main")).toBeHidden();
  expect(
    await page
      .locator("body")
      .evaluate((body) => getComputedStyle(body, "::after").content),
  ).toContain("内部资料，请联系负责人获取授权副本");
  await page.emulateMedia({ media: "screen" });
  await page.goto("/quality?topic=anova");
  expect(
    await page.locator('[data-restrict-copy="true"]').count(),
  ).toBeGreaterThan(0);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("main")).toBeHidden();
});

test("editor front-office reading is protected while editing preview stays usable", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await login(page, "editor");
  await page.goto("/articles/anova-intro");
  const content = page.locator("[data-content-protection]").last();
  await expect(content).toHaveAttribute("data-watermark", /（editor）/);
  await expect(content).toHaveAttribute("data-restrict-copy", "true");
  expect(
    await content.evaluate((root) => {
      const e = new Event("copy", { bubbles: true, cancelable: true });
      root.dispatchEvent(e);
      return e.defaultPrevented;
    }),
  ).toBe(true);
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("main")).toBeHidden();
  await page.emulateMedia({ media: "screen" });
  await page.goto("/manage/articles/anova-intro/edit");
  await expect(page.locator("[data-content-protection]")).toHaveCount(0);
  await page.getByRole("tab", { name: "源码", exact: true }).click();
  const source = page.getByRole("textbox", { name: "Markdown 源码" });
  const markdown = await source.inputValue();
  await source.focus();
  await source.selectText();
  await page.keyboard.press("ControlOrMeta+c");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    markdown,
  );
});

test("mobile watermark repeats behind content in both themes without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "member");
  await page.goto("/articles/anova-example");
  const content = page.locator("[data-content-protection]").last();
  const light = await content.evaluate(
    (root) => getComputedStyle(root, "::after").backgroundImage,
  );
  expect(light).toContain("data:image/svg+xml");
  expect(
    await content.evaluate((root) => getComputedStyle(root, "::after").zIndex),
  ).toBe("-1");
  await page.screenshot({
    path: "test-results/content-protection-mobile-light.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  expect(
    await content.evaluate(
      (root) => getComputedStyle(root, "::after").backgroundImage,
    ),
  ).not.toBe(light);
  await page.screenshot({
    path: "test-results/content-protection-mobile-dark.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

for (const role of ["member", "editor", "columnadmin"] as const) {
  test(`${role}: actual clipboard excludes article text on detail and topic pages`, async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await login(page, role);
    for (const url of ["/articles/anova-example", "/quality?topic=anova"]) {
      await page.goto(url);
      const content = page.locator("[data-content-protection]").first();
      await expect(content).toHaveAttribute("data-restrict-copy", "true");
      // A real keyboard copy must leave clipboard untouched, including a whole-page selection.
      await page.getByRole("link", { name: "首页", exact: true }).focus();
      await page.evaluate(async () => {
        await navigator.clipboard.writeText("clipboard-sentinel");
      });
      await content.evaluate((root) => {
        const range = document.createRange();
        range.selectNodeContents(root);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.keyboard.press("ControlOrMeta+c");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "clipboard-sentinel",
      );
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("ControlOrMeta+c");
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        "clipboard-sentinel",
      );
    }
  });
}
