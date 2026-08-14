import { describe, expect, test } from "vitest";

import { createPersonalizedHome } from "@/modules/personalized-home";

describe("personalized home", () => {
  test.each([
    ["2026-08-13T20:59:59.000Z", "晚上好"],
    ["2026-08-13T21:00:00.000Z", "早上好"],
    ["2026-08-14T03:59:59.000Z", "早上好"],
    ["2026-08-14T04:00:00.000Z", "下午好"],
    ["2026-08-14T09:59:59.000Z", "下午好"],
    ["2026-08-14T10:00:00.000Z", "晚上好"],
  ])("uses Asia/Shanghai greeting boundary at %s", (instant, greeting) => {
    expect(
      createPersonalizedHome({
        instant: new Date(instant),
        username: "member",
        displayName: "品质成员",
      }).greeting,
    ).toBe(greeting);
  });

  test("prefers display name and falls back to username", () => {
    const instant = new Date("2026-08-14T04:00:00.000Z");
    expect(
      createPersonalizedHome({
        instant,
        username: "member",
        displayName: "品质成员",
      }).name,
    ).toBe("品质成员");
    expect(
      createPersonalizedHome({ instant, username: "member", displayName: null })
        .name,
    ).toBe("member");
  });

  test("keeps the editorial information architecture stable", () => {
    const model = createPersonalizedHome({
      instant: new Date("2026-08-14T04:00:00.000Z"),
      username: "member",
      displayName: null,
    });
    expect(model.belief).toBe("数据驱动 · 结果闭环");
    expect(model.sections.map(({ title }) => title)).toEqual([
      "新人学习",
      "常用模板",
      "品质知识",
      "散热知识",
      "最近更新",
      "推荐书籍",
    ]);
  });
});
