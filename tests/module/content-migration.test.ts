import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { articles, users } from "@/db/schema";
import { createDiskFileStorage } from "@/modules/file-storage";
import { createContentMigrationService } from "@/modules/content-migration";
import { zipFiles } from "@/modules/markdown-package";

const EDITOR_ID = "00000000-0000-4000-8000-0000000000f1";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000f2";

describe("content migration import", () => {
  let database: PGlite;
  let directory: string;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values([
      {
        id: EDITOR_ID,
        username: "editor",
        normalizedUsername: "editor",
        passwordHash: "hash",
        role: "editor",
        mustChangePassword: false,
        createdAt: new Date(),
      },
      {
        id: ADMIN_ID,
        username: "admin",
        normalizedUsername: "admin",
        passwordHash: "hash",
        role: "administrator",
        mustChangePassword: false,
        createdAt: new Date(),
      },
    ]);
    directory = await mkdtemp(join(tmpdir(), "migration-test-"));
  });

  afterEach(async () => {
    await database.close();
    await rm(directory, { recursive: true, force: true });
  });

  function service() {
    return createContentMigrationService(database, {
      storage: createDiskFileStorage(directory),
    });
  }

  test("imports a single markdown file as a draft (PORT-01/05)", async () => {
    const markdown = `---
title: 测量系统分析入门
summary: MSA 基础
topic: msa
tags:
  - 测量
---

正文内容
`;
    const { stableId } = await service().importMarkdownFile({
      editorUserId: EDITOR_ID,
      markdown,
    });
    const article = (
      await createDatabaseClient(database)
        .select()
        .from(articles)
        .where(eq(articles.stableId, stableId))
    )[0];
    expect(article?.status).toBe("draft");
    expect(article?.title).toBe("测量系统分析入门");
    expect(article?.tags).toEqual(["测量"]);
  });

  test("rejects imports with an unknown topic (PORT-03 preflight)", async () => {
    const markdown = `---
title: 不存在主题的文章
topic: no-such-topic
---

正文
`;
    await expect(
      service().importMarkdownFile({ editorUserId: EDITOR_ID, markdown }),
    ).rejects.toThrow(/主题不存在/);
  });

  test("imports a ZIP with images and rewrites references (PORT-02)", async () => {
    const archive = zipFiles([
      {
        path: "guide.md",
        content: Buffer.from(
          `---
title: SPC 快速指南
topic: spc
---

![控制图](images/chart.png)
`,
          "utf8",
        ),
      },
      {
        path: "images/chart.png",
        content: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
      },
    ]);
    const imported = await service().importZipPackage({
      editorUserId: EDITOR_ID,
      zipBuffer: archive,
    });
    expect(imported).toHaveLength(1);
    const article = (
      await createDatabaseClient(database)
        .select()
        .from(articles)
        .where(eq(articles.stableId, imported[0]!.stableId))
    )[0];
    expect(article?.bodyMarkdown).toMatch(
      /!\[控制图\]\(\/uploads\/[0-9a-f-]+\)/,
    );
  });

  test("batch preview lists added, conflicts and invalid without writing (PORT-03/04)", async () => {
    const client = createDatabaseClient(database);
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d1",
      stableId: "existing-article",
      title: "重复标题",
      summary: "已有内容",
      bodyMarkdown: "正文",
      primaryTopicId: "00000000-0000-4000-8000-000000000c04",
      tags: [],
      contentOwnerId: EDITOR_ID,
      status: "draft",
      updatedAt: new Date(),
      createdAt: new Date(),
    });
    const archive = zipFiles([
      {
        path: "a.md",
        content: Buffer.from(
          "---\ntitle: 新文章\nsummary: 新内容\ntopic: anova\n---\n正文",
        ),
      },
      {
        path: "b.md",
        content: Buffer.from("---\ntitle: 重复标题\ntopic: anova\n---\n正文"),
      },
      {
        path: "c.md",
        content: Buffer.from("---\nsummary: 缺标题缺主题\n---\n正文"),
      },
    ]);
    const preview = await service().previewBatchImport({
      adminUserId: ADMIN_ID,
      zipBuffer: archive,
    });
    expect(preview.added.map((candidate) => candidate.title)).toEqual([
      "新文章",
    ]);
    expect(preview.conflicts.map((candidate) => candidate.title)).toEqual([
      "重复标题",
    ]);
    expect(preview.invalid).toHaveLength(1);

    const before = (await client.select().from(articles)).length;
    const result = await service().importBatch({
      adminUserId: ADMIN_ID,
      zipBuffer: archive,
    });
    expect(result).toEqual({ imported: 1, skipped: 2 });
    const after = (await client.select().from(articles)).length;
    expect(after).toBe(before + 1);
  });
});
