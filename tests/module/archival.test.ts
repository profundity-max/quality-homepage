import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articleVersions,
  articles,
  contentAuditEvents,
  sections,
  templates,
  templateVersions,
  users,
} from "@/db/schema";
import { createArchivalService } from "@/modules/archival";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const READER_ID = "00000000-0000-4000-8000-0000000000f3";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000e1";
const VERSION_ID = "00000000-0000-4000-8000-0000000000e2";
const NOW = new Date("2026-08-21T02:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("archival service", () => {
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
        mustChangePassword: false,
        createdAt: NOW,
      },
      {
        id: EDITOR_ID,
        username: "editor",
        normalizedUsername: "editor",
        passwordHash: "hash",
        role: "editor",
        mustChangePassword: false,
        createdAt: NOW,
      },
      {
        id: READER_ID,
        username: "reader",
        normalizedUsername: "reader",
        passwordHash: "hash",
        role: "reader",
        mustChangePassword: false,
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
    return createArchivalService(database);
  }

  test("archives every content type with a required reason and audit (AUDIT-02/DEL-01)", async () => {
    await service().archive(
      EDITOR_ID,
      { type: "article", stableId: "anova-intro" },
      "并入新主题",
      NOW,
    );
    await service().archive(
      EDITOR_ID,
      { type: "template", stableId: "demo-template" },
      "模板下线",
      NOW,
    );
    await service().archive(
      ADMIN_ID,
      { type: "section", stableId: "thermal-knowledge" },
      "栏目重组",
      NOW,
    );
    await service().archive(
      ADMIN_ID,
      { type: "topic", stableId: "msa" },
      "主题合并",
      NOW,
    );
    await service().archive(
      EDITOR_ID,
      { type: "template-category", stableId: "inspection-and-testing" },
      "分类整理",
      NOW,
    );

    const events = await createDatabaseClient(database)
      .select()
      .from(contentAuditEvents);
    expect(events.map((event) => event.eventType).sort()).toEqual([
      "article.archive",
      "section.archive",
      "template-category.archive",
      "template.archive",
      "topic.archive",
    ]);
    expect(events.every((event) => event.reason !== null)).toBe(true);

    const items = await service().listTrashed(ADMIN_ID, {});
    expect(items.map((item) => item.type).sort()).toEqual([
      "article",
      "section",
      "template",
      "template-category",
      "topic",
    ]);
  });

  test("rejects blank reasons for every type", async () => {
    for (const target of [
      { type: "article" as const, stableId: "anova-intro" },
      { type: "template" as const, stableId: "demo-template" },
      { type: "section" as const, stableId: "quality-knowledge" },
      { type: "topic" as const, stableId: "msa" },
      {
        type: "template-category" as const,
        stableId: "inspection-and-testing",
      },
    ]) {
      await expect(
        service().archive(EDITOR_ID, target, "   ", NOW),
      ).rejects.toThrow(/归档必须填写原因/);
    }
  });

  test("restores content to its previous semantics (DEL-02)", async () => {
    await service().archive(
      ADMIN_ID,
      { type: "article", stableId: "anova-intro" },
      "误归档",
      NOW,
    );
    const articleRestored = await service().restore(ADMIN_ID, {
      type: "article",
      stableId: "anova-intro",
    });
    expect(articleRestored.status).toBe("draft");

    await service().archive(
      ADMIN_ID,
      { type: "template", stableId: "demo-template" },
      "误归档",
      NOW,
    );
    const templateRestored = await service().restore(ADMIN_ID, {
      type: "template",
      stableId: "demo-template",
    });
    expect(templateRestored.status).toBe("published");

    await service().archive(
      ADMIN_ID,
      { type: "section", stableId: "thermal-knowledge" },
      "误归档",
      NOW,
    );
    await service().restore(ADMIN_ID, {
      type: "section",
      stableId: "thermal-knowledge",
    });
    const section = (
      await createDatabaseClient(database)
        .select()
        .from(sections)
        .where(eq(sections.stableId, "thermal-knowledge"))
    )[0];
    expect(section?.archivedAt).toBeNull();
  });

  test("permanent delete waits 30 days and never removes files (DEL-02/03)", async () => {
    await service().archive(
      ADMIN_ID,
      { type: "article", stableId: "anova-intro" },
      "测试",
      NOW,
    );
    await expect(
      service().permanentlyDelete(
        ADMIN_ID,
        {
          type: "article",
          stableId: "anova-intro",
        },
        NOW,
      ),
    ).rejects.toThrow(/30 天/);

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
    // 归档满 30 天后才允许永久删除
    await service().archive(
      ADMIN_ID,
      { type: "article", stableId: "anova-intro" },
      "测试",
      daysAgo(31),
    );
    await service().permanentlyDelete(
      ADMIN_ID,
      {
        type: "article",
        stableId: "anova-intro",
      },
      NOW,
    );
    const article = (
      await createDatabaseClient(database)
        .select()
        .from(articles)
        .where(eq(articles.stableId, "anova-intro"))
    )[0];
    expect(article).toBeUndefined();
  });

  test("only articles and templates can be permanently deleted (IA-07)", async () => {
    await service().archive(
      ADMIN_ID,
      { type: "topic", stableId: "msa" },
      "测试",
      daysAgo(31),
    );
    await expect(
      service().permanentlyDelete(
        ADMIN_ID,
        {
          type: "topic",
          stableId: "msa",
        },
        NOW,
      ),
    ).rejects.toThrow(/不支持永久删除/);
  });

  test("readers cannot manage the archive; editors cannot archive sections (roles)", async () => {
    await expect(service().listTrashed(READER_ID, {})).rejects.toThrow(
      /Administrator/i,
    );
    await expect(
      service().archive(
        EDITOR_ID,
        { type: "section", stableId: "quality-knowledge" },
        "尝试",
      ),
    ).rejects.toThrow(/Administrator access is required/);
    await expect(
      service().archive(
        EDITOR_ID,
        { type: "article", stableId: "anova-intro" },
        "编辑者归档",
        NOW,
      ),
    ).resolves.toBeUndefined();
  });

  test("refuses to archive a topic that still has published articles (IA-09)", async () => {
    await expect(
      service().archive(
        ADMIN_ID,
        { type: "topic", stableId: "anova" },
        "迁移前尝试",
      ),
    ).rejects.toThrow(/migrate them to another topic/i);
  });

  test("refuses to archive a section containing published articles (IA-09)", async () => {
    await expect(
      service().archive(
        ADMIN_ID,
        { type: "section", stableId: "quality-knowledge" },
        "迁移前尝试",
      ),
    ).rejects.toThrow(/migrate them before archiving/i);
  });
});
