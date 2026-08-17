import { describe, expect, test } from "vitest";

import { applyFormatting, type FormatCommand } from "@/modules/editor-commands";

describe("editor formatting commands", () => {
  test("toggles bold around selection", () => {
    // 选中已加粗内容（不含包裹符）→ 去除包裹
    const result = applyFormatting(
      "这是一段**粗体**文本",
      {
        start: 6,
        end: 8,
      },
      "bold",
    );
    expect(result.text).toBe("这是一段粗体文本");
    expect(result.selectionStart).toBe(4);
    expect(result.selectionEnd).toBe(6);
  });

  test("wraps plain selection with bold markers", () => {
    const result = applyFormatting("hello world", { start: 0, end: 5 }, "bold");
    expect(result.text).toBe("**hello** world");
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(9);
  });

  test("turns a line into a heading", () => {
    const result = applyFormatting("普通标题行", { start: 0, end: 5 }, "h2");
    expect(result.text).toBe("## 普通标题行");
  });

  test("toggles an ordered list marker", () => {
    const result = applyFormatting(
      "1. 第一项\n2. 第二项",
      { start: 0, end: 5 },
      "ordered-list",
    );
    expect(result.text).toBe("第一项\n2. 第二项");
  });

  test("wraps selection in inline code", () => {
    const result = applyFormatting(
      "use the function",
      { start: 8, end: 16 },
      "code",
    );
    expect(result.text).toBe("use the `function`");
  });

  test("creates a callout block", () => {
    const result = applyFormatting(
      "注意这里",
      { start: 0, end: 4 },
      "callout-warning",
    );
    expect(result.text).toBe("> [!warning] 注意这里");
  });

  test("inserts a table template", () => {
    const result = applyFormatting("", { start: 0, end: 0 }, "table");
    expect(result.text).toContain("| 列1 | 列2 |");
    expect(result.text).toContain("| --- | --- |");
  });

  test("unknown commands leave text unchanged", () => {
    const result = applyFormatting(
      "unchanged",
      { start: 0, end: 9 },
      "bogus" as FormatCommand,
    );
    expect(result.text).toBe("unchanged");
  });
});
