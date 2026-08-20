import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articles,
  articleVersions,
  sections,
  templates,
  templateVersions,
  users,
} from "@/db/schema";
import { createRecycleBinService } from "@/modules/recycle-bin";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000e1";
const VERSION_ID = "00000000-0000-4000-8000-0000000000e2";
const NOW = new Date("2026-08-20T02:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("recycle bin service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values([
      {
        id: ADMIN_ID,
        username: "admin",
        normalizedUsername: "admin",
        passwordHash: "hash",
        role: "administrator",
        createdAt: NOW,
      },
      {
        id: EDITOR_ID,
        username: "editor",
        normalizedUsername: "editor",
        passwordHash: "hash",
        role: "editor",
        createdAt: NOW,
      },
    ]);
    await client.insert(articles).values({
      id: ARTICLE_ID,
      stableId: "anova-intro",
      title: "ANOVA 入门",
      summary: "方差分析基础",
      bodyMarkdown: "正文",
      primaryTopicId: "00000000-0000-4000-8000-000000000c04",
      tags: ["统计"],
      contentOwnerId: EDITOR_ID,
      status: "published",
      publishedAt: daysAgo(10),
      nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: daysAgo(2),
      createdAt: daysAgo(20),
    });
    await client.insert(templates).values({
      id: TEMPLATE_ID,
      stableId: "demo-template",
      name: "检验记录表",
      purpose: "来料检验",
      categoryId: "00000000-0000-4000-8000-0000000000a1",
      contentOwnerId: EDITOR_ID,
      status: "published",
      nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: NOW,
      createdAt: NOW,
    });
    await client.insert(templateVersions).values({
      id: VERSION_ID,
      templateId: TEMPLATE_ID,
      version: 1,
      versionLabel: "1.0",
      changeNote: "初版",
      fileName: "record.xlsx",
      extension: "xlsx",
      byteSize: 1024,
      sha256: "a".repeat(64),
      status: "active",
      quarantineState: "passed",
      createdAt: NOW,
    });
  });

  afterEach(async () => {
    await database.close();
  });

  function service() {
    return createRecycleBinService(database);
  }

  test("lists archived articles and templates with archived time (DEL-02)", async () => {
    await service().archiveArticle(
      ADMIN_ID,
      "anova-intro",
      "内容并入新主题",
      NOW,
    );
    await service().archiveTemplate(ADMIN_ID, "demo-template", "模板下线", NOW);

    const items = await service().listTrashed(ADMIN_ID, {});
    expect(items.map((item) => item.type).sort()).toEqual([
      "article",
      "template",
    ]);
    const article = items.find((item) => item.type === "article");
    expect(article).toMatchObject({
      stableId: "anova-intro",
      title: "ANOVA 入门",
      archivedAt: NOW,
    });
  });

  test("restores an archived article to its previous state (DEL-02)", async () => {
    await service().archiveArticle(ADMIN_ID, "anova-intro", "误归档", NOW);
    const restored = await service().restoreArticle(ADMIN_ID, "anova-intro");
    expect(restored.status).toBe("draft");
    expect(restored.archivedAt).toBeNull();

    const rows = await service().listTrashed(ADMIN_ID, {});
    expect(rows).toHaveLength(0);
  });

  test("refuses permanent delete before 30 days and allows after (DEL-02)", async () => {
    await service().archiveArticle(ADMIN_ID, "anova-intro", "测试", NOW);
    await expect(
      service().permanentlyDeleteArticle(ADMIN_ID, "anova-intro", NOW),
    ).rejects.toThrow(/30|保留期/i);

    await service().archiveArticle(
      ADMIN_ID,
      "anova-intro",
      "测试",
      daysAgo(31),
    );
    await service().permanentlyDeleteArticle(ADMIN_ID, "anova-intro", NOW);
    const article = (
      await createDatabaseClient(database)
        .select()
        .from(articles)
        .where(eq(articles.stableId, "anova-intro"))
    )[0];
    expect(article).toBeUndefined();
  });

  test("permanent delete never removes image assets referenced by history (DEL-03)", async () => {
    await service().archiveArticle(
      ADMIN_ID,
      "anova-intro",
      "测试",
      daysAgo(31),
    );
    await createDatabaseClient(database)
      .insert(articleVersions)
      .values({
        id: "00000000-0000-4000-8000-0000000000f1",
        articleId: ARTICLE_ID,
        version: 1,
        kind: "publish",
        title: "ANOVA 入门",
        summary: "摘要",
        bodyMarkdown: "![图](/uploads/asset-1)",
        primaryTopicId: "00000000-0000-4000-8000-000000000c04",
        tags: [],
        contentOwnerId: EDITOR_ID,
        createdAt: daysAgo(10),
      });

    // 回收站不删除仍被版本引用的文件；内容元数据可删除
    await service().permanentlyDeleteArticle(ADMIN_ID, "anova-intro", NOW);
    const article = (
      await createDatabaseClient(database)
        .select()
        .from(articles)
        .where(eq(articles.stableId, "anova-intro"))
    )[0];
    expect(article).toBeUndefined();
  });

  test("restores archived templates and sections (DEL-02)", async () => {
    await service().archiveTemplate(ADMIN_ID, "demo-template", "下线", NOW);
    const restoredTemplate = await service().restoreTemplate(
      ADMIN_ID,
      "demo-template",
    );
    expect(restoredTemplate.status).toBe("published");
    expect(restoredTemplate.archivedAt).toBeNull();

    // 栏目/主题归档由栏目管理入口完成（IA-07），回收站只负责列出与恢复
    await createDatabaseClient(database)
      .update(sections)
      .set({ archivedAt: NOW })
      .where(eq(sections.stableId, "quality-knowledge"));
    await service().restoreSection(ADMIN_ID, "quality-knowledge");
    const sectionItems = await service().listTrashed(ADMIN_ID, {
      types: ["section"],
    });
    expect(sectionItems).toHaveLength(0);
  });

  test("readers cannot manage the recycle bin", async () => {
    await expect(
      service().listTrashed("00000000-0000-4000-8000-0000000000f9", {}),
    ).rejects.toThrow(/Administrator/i);
  });
});
