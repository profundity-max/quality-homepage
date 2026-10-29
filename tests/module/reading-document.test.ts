import { expect, test } from "vitest";
import { renderReadingDocument } from "@/modules/shared/markdown-renderer";

test("inline documents own independent anchors with matching accessible TOC", async () => {
  const a = await renderReadingDocument("## 相同标题\n\n内容", "article-a");
  const b = await renderReadingDocument("## 相同标题\n\n内容", "article-b");
  expect(a.entries[0].id).not.toBe(b.entries[0].id);
  expect(a.html).toContain(`id="${a.entries[0].id}"`);
  expect(b.html).toContain(`id="${b.entries[0].id}"`);
  expect(a.entries[0].text).toBe("相同标题");
});
