import { chromium } from "playwright";
import { expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { rcaCourse as course } from "../../../src/modules/learning/rca.ts";

await mkdir("test-results/rca", { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const origin = process.env.RCA_BASE ?? "http://127.0.0.1:3011";
const fixture = process.env.RCA_ARTICLE ?? "article-e93d377c";
const base = `${origin}/articles/${fixture}`;
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const main = page.getByRole("main");
const heading = () => main.getByRole("heading", { level: 1 });
const button = (name) => main.getByRole("button", { name, exact: true });
const snap = (name) =>
  page.screenshot({
    path: `test-results/rca/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
const hit = async (name) => button(name).click();
const goNext = () => hit("下一步");
const navigate = (name) =>
  main
    .getByRole("navigation", { name: "课程导航" })
    .getByRole("button", { name, exact: true })
    .click();
const choose = (answer) => main.getByRole("radio").nth(answer).check();

try {
  await page.goto(`${origin}/learning`);
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("用户名").fill("editor");
  await page.getByLabel("密码").fill("editor secure password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(heading()).toHaveText("学习中心");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "首页", exact: true })
    .click();
  const center = main.getByRole("link", { name: "进入学习中心", exact: true });
  await expect(center).toBeVisible();
  await snap("desktop-learning-entry");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(center).toBeInViewport();
  await snap("mobile-learning-entry");
  await page.setViewportSize({ width: 1440, height: 960 });
  await center.click();
  await expect(heading()).toHaveText("学习中心");
  await snap("desktop-learning-center");
  await main
    .getByRole("link", { name: "进入 RCA 根因分析", exact: true })
    .click();
  await expect(heading()).toHaveText("RCA 根因分析");
  await expect(button("案例模拟")).toBeDisabled();
  await expect(button("后测")).toBeDisabled();
  const a11y = await new AxeBuilder({ page })
    .include("main")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  assert.deepEqual(
    a11y.violations.map((v) => v.id),
    [],
  );
  await snap("desktop-map");
  await main.getByRole("link", { name: "原文查阅", exact: true }).click();
  await expect(page).toHaveURL(base);
  await main
    .getByRole("link", { name: /进入 RCA 根因分析\s+学习模式/ })
    .click();
  await hit("开始前测");
  const assessment = async (set, label, wrongFirst) => {
    for (let i = 0; i < set.length; i++) {
      const item = set[i];
      const answer =
        i === 0 && wrongFirst ? (item.correct + 1) % 3 : item.correct;
      await choose(answer);
      if (i + 1 < set.length) {
        await expect(button(`提交${label}`)).toBeDisabled();
        await hit("下一题");
      }
    }
    await expect(main.getByText("正确答案", { exact: false })).toHaveCount(0);
    await hit(`提交${label}`);
    await hit("确认提交");
    await expect(main.getByRole("status")).toContainText(
      `${set.length - Number(wrongFirst)} / ${set.length}`,
    );
  };
  await assessment(course.pre, "前测", true);
  await goNext();
  await expect(heading()).toHaveText("工程情景");
  await goNext();
  const practice = async (item, wrong = false) => {
    await choose(wrong ? (item.correct + 1) % 3 : item.correct);
    await hit("检验判断");
    await expect(main.getByRole("status")).toHaveText(
      wrong ? "需要复核" : "判断正确",
    );
  };
  for (const [mi, m] of course.modules.entries()) {
    for (const card of m.cards) {
      await expect(heading()).toHaveText(card.title);
      await goNext();
      if (card.recall) {
        const flip = button("翻转卡片");
        await flip.focus();
        await page.keyboard.press("Enter");
        await expect(main.locator("#recall-answer")).toBeVisible();
        await hit("隐藏答案");
        await expect(main.locator("#recall-answer")).toBeHidden();
        await goNext();
      }
    }
    for (const [qi, item] of m.checks.entries()) {
      await practice(item, mi === 0 && qi === 0);
      if (mi === 0 && qi === 0) {
        await hit("回顾相关卡片");
        await expect(heading()).toHaveText(m.cards[0].title);
        await hit("返回题目");
        await expect(main.getByRole("status")).toHaveText("需要复核");
        await hit("再练一次");
        await practice(item);
      }
      if (mi < course.modules.length - 1 || qi + 1 < m.checks.length)
        await goNext();
    }
  }
  await hit("进入案例阶段");
  for (const [i, stage] of course.simulation.stages.entries()) {
    await expect(heading()).toHaveText(stage.title);
    await expect(button(i < 6 ? "进入案例阶段" : "下一步")).toBeDisabled();
    if (i < 6)
      await expect(
        main.getByText(course.simulation.stages[i + 1].evidence, {
          exact: true,
        }),
      ).toHaveCount(0);
    if (i === 3) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(
        main.getByRole("region", { name: "受控试验数据" }),
      ).toBeVisible();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      );
      await page.evaluate(() => window.scrollTo(0, 0));
      await snap("mobile-evidence");
      await page.reload();
      await expect(heading()).toHaveText(stage.title);
      await navigate("知识地图");
      await hit("返回学习位置");
      await expect(heading()).toHaveText(stage.title);
      await page.setViewportSize({ width: 1440, height: 960 });
    }
    await practice(stage.question);
    await hit(i < 6 ? "进入案例阶段" : "下一步");
  }
  await expect(heading()).toHaveText("后测");
  await assessment(course.post, "后测", true);
  await hit("查看学习总结");
  await expect(heading()).toHaveText("学习总结");
  await expect(main.getByText("14 / 15", { exact: true })).toBeVisible();
  await expect(main.getByText("9 / 10", { exact: true })).toBeVisible();
  await snap("desktop-summary");
  await page.reload();
  await expect(heading()).toHaveText("学习总结");
  await main.getByRole("link", { name: "改版对比", exact: true }).click();
  await expect(
    main.getByRole("region", { name: "知识覆盖矩阵" }).locator("tbody tr"),
  ).toHaveCount(12);
  await expect(
    main.getByRole("region", { name: "改版对比表" }).locator("tbody tr"),
  ).toHaveCount(10);
  await snap("desktop-comparison");
  await main
    .getByRole("link", { name: "问题定义与 3W1H", exact: true })
    .click();
  await expect(page).toHaveURL(/#toc-/);
  await expect(
    page.locator("article").getByRole("heading", { name: /先把 Problem/ }),
  ).toBeVisible();
  await page.goto(`${origin}/articles/anova-intro`);
  await expect(main.getByRole("link", { name: /进入.*学习模式/ })).toHaveCount(
    0,
  );
  assert.equal(
    (await page.goto(`${origin}/articles/anova-intro/learn`)).status(),
    404,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: authentication, original/reference route, keyboard recall, all checks, retry and first score, seven gated stages, mobile table, resume, pre/post feedback, summary, matrix, unrelated article, Axe WCAG and no page errors",
  );
} finally {
  await browser.close();
}
