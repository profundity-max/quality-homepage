import { describe, expect, test } from "vitest";

import {
  parseFrontmatter,
  serializeFrontmatter,
  unzip,
  zipFiles,
} from "@/modules/markdown-package";

describe("markdown package frontmatter", () => {
  test("parses scalar and list fields", () => {
    const markdown = `---
title: "ANOVA 入门"
summary: 方差分析基础
topic: anova
tags:
  - 统计
  - 假设检验
aliases: [ANOVA 指南, 方差分析入门]
owner: editor
status: draft
next_review_at: 2026-09-01
---

正文内容
`;
    const { frontmatter, body } = parseFrontmatter(markdown);
    expect(frontmatter).toEqual({
      title: "ANOVA 入门",
      summary: "方差分析基础",
      topic: "anova",
      tags: ["统计", "假设检验"],
      aliases: ["ANOVA 指南", "方差分析入门"],
      owner: "editor",
      status: "draft",
      next_review_at: "2026-09-01",
    });
    expect(body).toBe("正文内容");
  });

  test("treats a document without frontmatter as body-only", () => {
    const { frontmatter, body } = parseFrontmatter("# 标题\n\n正文");
    expect(frontmatter).toEqual({});
    expect(body).toBe("# 标题\n\n正文");
  });

  test("serializes fields back to parseable markdown", () => {
    const markdown = serializeFrontmatter(
      {
        title: "ANOVA 入门",
        topic: "anova",
        tags: ["统计"],
        aliases: ["方差分析入门"],
      },
      "正文",
    );
    const parsed = parseFrontmatter(markdown);
    expect(parsed.frontmatter).toEqual({
      title: "ANOVA 入门",
      topic: "anova",
      tags: ["统计"],
      aliases: ["方差分析入门"],
    });
    expect(parsed.body).toBe("正文");
  });
});

describe("markdown package ZIP", () => {
  test("round-trips stored entries with utf-8 names", () => {
    const archive = zipFiles([
      {
        path: "articles/anova.md",
        content: Buffer.from("方差分析正文", "utf8"),
      },
      { path: "images/图.png", content: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
    ]);
    const entries = unzip(archive);
    expect(entries.get("articles/anova.md")?.toString("utf8")).toBe(
      "方差分析正文",
    );
    expect(entries.get("images/图.png")).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  test("detects corrupted archives", () => {
    const archive = zipFiles([{ path: "a.md", content: Buffer.from("x") }]);
    // 数据区起始 = 本地头 30 字节 + 文件名 "a.md" 4 字节
    archive[34] = 0xff;
    expect(() => unzip(archive)).toThrow(/CRC|ZIP/i);
  });
});
