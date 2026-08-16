import { describe, expect, test } from "vitest";

import {
  extractTableOfContents,
  renderMarkdown,
} from "@/modules/shared/markdown-renderer";

describe("markdown renderer", () => {
  test("renders headings, emphasis, lists, links, code blocks and tables", async () => {
    const html = await renderMarkdown(`# 标题一

**粗体** and *斜体*.

- 项目甲
- 项目乙

[链接](https://example.com)

\`\`\`ts
const x: number = 1;
\`\`\`

| 名称 | 值 |
| ---- | --- |
| 甲   | 1   |
`);

    expect(html).toContain("<h1");
    expect(html).toContain("<strong>粗体</strong>");
    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<li>项目甲</li>");
    expect(html).toContain('<a href="https://example.com">链接</a>');
    expect(html).toContain("<code");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>名称</th>");
  });

  test("strips script tags, iframes and event handlers", async () => {
    const html = await renderMarkdown(
      `<script>alert("xss")</script>

<iframe src="https://evil.example"></iframe>

<img src="x" onerror="alert(1)" />

[点我](javascript:alert(1))`,
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  test("renders six callout types with type-preserving structure", async () => {
    const html = await renderMarkdown(`> [!info] 信息
> 一些信息正文

> [!tip] 提示
> 一个提示

> [!important] 重点
> 重点内容

> [!warning] 警告
> 注意风险

> [!example] 示例
> 例如这样

> [!formula] 公式
> 公式说明`);

    for (const type of [
      "info",
      "tip",
      "important",
      "warning",
      "example",
      "formula",
    ]) {
      expect(html).toContain(`callout callout-${type}`);
      expect(html).toContain(`callout-title`);
    }
  });

  test("keeps multi-paragraph and list content inside a callout body", async () => {
    const html = await renderMarkdown(`> [!warning] 多段
>
> 第一段。
>
> 第二段。
>
> - 列表项甲
> - 列表项乙`);

    expect(html).toContain('class="callout callout-warning"');
    expect(html).toContain("第一段。");
    expect(html).toContain("第二段。");
    expect(html).toContain("<li>列表项甲</li>");
    expect(html).toContain("<li>列表项乙</li>");
  });

  test("callout without a title does not swallow the body", async () => {
    const html = await renderMarkdown(`> [!warning]
> 这是正文，不是标题。`);

    expect(html).toContain('class="callout callout-warning"');
    expect(html).not.toContain("callout-title");
    expect(html).toContain("这是正文，不是标题。");
    expect(html).toContain("callout-body");
  });

  test("extracts a table of contents from heading levels", async () => {
    const toc = await extractTableOfContents(`# 不进入目录

## 章节一

### 小节一甲

## 章节二

### 小节二甲

#### 深度四`);
    expect(toc).toEqual([
      { id: "toc-1", depth: 2, text: "章节一" },
      { id: "toc-2", depth: 3, text: "小节一甲" },
      { id: "toc-3", depth: 2, text: "章节二" },
      { id: "toc-4", depth: 3, text: "小节二甲" },
      { id: "toc-5", depth: 4, text: "深度四" },
    ]);
  });

  test("includes inline formatting text in table of contents", async () => {
    const toc = await extractTableOfContents(`## 使用 \`代码\` 与 **粗体**`);
    expect(toc).toEqual([{ id: "toc-1", depth: 2, text: "使用 代码 与 粗体" }]);
  });

  test("renders inline and block math without network resources", async () => {
    const html = await renderMarkdown(
      `均值公式 $\\bar{x} = \\frac{1}{n}\\sum x_i$ 在行内。

$$\\sigma = \\sqrt{\\frac{\\sum (x_i - \\bar{x})^2}{n}}$$`,
    );

    expect(html).toContain('class="katex"');
    expect(html).not.toContain("https://");
    expect(html).not.toContain("http://");
  });
});
