import { expect, test } from "vitest";
import { renderMarkdown } from "@/modules/shared/markdown-renderer";

test("rendered images and original-image links avoid old immutable browser cache", async () => {
  const path = "/uploads/00000000-0000-4000-8000-000000000001.png";
  const html = await renderMarkdown(
    `![图](${path})\n\n[原图](${path}?old=1#view)`,
  );
  expect(html).toContain(`src="${path}?protected=4.1"`);
  expect(html).toContain(`href="${path}?old=1&#x26;protected=4.1#view"`);
});
