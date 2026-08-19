import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articles,
  articleDailyReach,
  articleReadEvents,
  searchAggregates,
  searchEvents,
  templateDownloadEvents,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { createContentStatsService } from "@/modules/content-stats";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000f3";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const OTHER_ARTICLE_ID = "00000000-0000-4000-8000-0000000000d2";
const OLD_UNREAD_ARTICLE_ID = "00000000-0000-4000-8000-0000000000d3";
const TEMPLATE_ID = "00000000-0000-4000-8000-0000000000e1";
const VERSION_ID = "00000000-0000-4000-8000-0000000000e2";
const NOW = new Date("2026-08-19T02:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

describe("content statistics service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);
    await client.insert(users).values([
      {
        id: READER_ID,
        username: "reader",
        normalizedUsername: "reader",
        passwordHash: "hash",
        role: "reader",
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
      {
        id: ADMIN_ID,
        username: "admin",
        normalizedUsername: "admin",
        passwordHash: "hash",
        role: "administrator",
        createdAt: NOW,
      },
    ]);
    await client.insert(articles).values([
      {
        id: ARTICLE_ID,
        stableId: "anova-intro",
        title: "ANOVA 入门",
        summary: "方差分析基础",
        bodyMarkdown: "正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c04",
        tags: ["统计"],
        contentOwnerId: EDITOR_ID,
        status: "published",
        publishedAt: daysAgo(120),
        nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: daysAgo(2),
        createdAt: daysAgo(130),
      },
      {
        id: OTHER_ARTICLE_ID,
        stableId: "spc-basics",
        title: "SPC 基础",
        summary: "统计过程控制",
        bodyMarkdown: "正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c12",
        tags: ["统计"],
        contentOwnerId: EDITOR_ID,
        status: "published",
        publishedAt: daysAgo(10),
        nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: daysAgo(1),
        createdAt: daysAgo(20),
      },
      {
        id: OLD_UNREAD_ARTICLE_ID,
        stableId: "old-unread",
        title: "长期未读文章",
        summary: "很久没有阅读",
        bodyMarkdown: "正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c12",
        tags: [],
        contentOwnerId: EDITOR_ID,
        status: "published",
        publishedAt: daysAgo(200),
        nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
        updatedAt: daysAgo(200),
        createdAt: daysAgo(210),
      },
    ]);
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
    return createContentStatsService(database);
  }

  test("dedups reads within 30 minutes and increments the count once (STAT-01)", async () => {
    const first = await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: NOW,
    });
    expect(first).toBe(true);
    const second = await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: new Date(NOW.getTime() + 10 * 60 * 1000),
    });
    expect(second).toBe(false);

    const article = (
      await createDatabaseClient(database)
        .select({ readCount: articles.readCount })
        .from(articles)
        .where(eq(articles.stableId, "anova-intro"))
    )[0];
    expect(article?.readCount).toBe(1);

    const afterWindow = await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: new Date(NOW.getTime() + 31 * 60 * 1000),
    });
    expect(afterWindow).toBe(true);
  });

  test("daily reach counts distinct readers per day (STAT-03)", async () => {
    await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: NOW,
    });
    const otherReader = "00000000-0000-4000-8000-0000000000f4";
    await createDatabaseClient(database).insert(users).values({
      id: otherReader,
      username: "reader2",
      normalizedUsername: "reader2",
      passwordHash: "hash",
      role: "reader",
      createdAt: NOW,
    });
    await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: otherReader,
      instant: new Date(NOW.getTime() + 60 * 60 * 1000),
    });
    await service().recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(-1),
    });

    const rows = await createDatabaseClient(database)
      .select()
      .from(articleDailyReach);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.reachCount).sort()).toEqual([1, 2]);
  });

  test("reach windows count distinct users per period (STAT-03)", async () => {
    const usersByAge = [
      [
        "00000000-0000-4000-8000-0000000000f5",
        5,
        "00000000-0000-4000-8000-0000000000b1",
      ],
      [
        "00000000-0000-4000-8000-0000000000f6",
        20,
        "00000000-0000-4000-8000-0000000000b2",
      ],
      [
        "00000000-0000-4000-8000-0000000000f7",
        60,
        "00000000-0000-4000-8000-0000000000b3",
      ],
      [
        "00000000-0000-4000-8000-0000000000f8",
        200,
        "00000000-0000-4000-8000-0000000000b4",
      ],
    ] as const;
    const client = createDatabaseClient(database);
    for (const [id, age, eventId] of usersByAge) {
      await client.insert(users).values({
        id,
        username: id,
        normalizedUsername: id,
        passwordHash: "hash",
        role: "reader",
        createdAt: NOW,
      });
      await client.insert(articleReadEvents).values({
        id: eventId,
        articleId: ARTICLE_ID,
        userId: id,
        readAt: daysAgo(age),
      });
    }

    const reach = await service().reachStats(ARTICLE_ID, NOW);
    expect(reach).toEqual({
      d7: 1,
      d30: 2,
      d90: 3,
      all: 4,
    });
  });

  test("records template downloads per user and keeps totals (STAT-04/FILE-04)", async () => {
    await service().recordTemplateDownload({
      templateVersionId: VERSION_ID,
      userId: READER_ID,
      instant: NOW,
    });
    await service().recordTemplateDownload({
      templateVersionId: VERSION_ID,
      userId: READER_ID,
      instant: new Date(NOW.getTime() + 60_000),
    });

    const version = (
      await createDatabaseClient(database)
        .select({ downloadCount: templateVersions.downloadCount })
        .from(templateVersions)
        .where(eq(templateVersions.id, VERSION_ID))
    )[0];
    expect(version?.downloadCount).toBe(2);
    const events = await createDatabaseClient(database)
      .select()
      .from(templateDownloadEvents);
    expect(events).toHaveLength(2);
  });

  test("editor dashboard reports hot, high-reach, growth, unread, search-opens and downloads (STAT-04)", async () => {
    const stats = service();
    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(10),
    });
    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(5),
    });
    await stats.recordArticleRead({
      articleId: OTHER_ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(1),
    });
    // 搜索后 30 分钟内打开文章 → 计入“搜索后常打开”
    const client = createDatabaseClient(database);
    await client.insert(searchEvents).values({
      id: "00000000-0000-4000-8000-0000000000a1",
      userId: READER_ID,
      query: "SPC",
      hasResults: true,
      createdAt: daysAgo(1),
    });
    await stats.recordTemplateDownload({
      templateVersionId: VERSION_ID,
      userId: READER_ID,
      instant: NOW,
    });

    const dashboard = await stats.editorDashboard(EDITOR_ID, NOW);
    expect(dashboard.hotArticles[0]?.stableId).toBe("anova-intro");
    expect(dashboard.highReachArticles.length).toBeGreaterThan(0);
    expect(dashboard.growingArticles.length).toBeGreaterThan(0);
    expect(
      dashboard.growingArticles.find(
        (article) => article.stableId === "anova-intro",
      ),
    ).toMatchObject({ recentReads: 1, previousReads: 1 });
    expect(dashboard.longUnreadArticles.map((a) => a.stableId)).toContain(
      "old-unread",
    );
    expect(dashboard.searchDrivenOpens.map((a) => a.stableId)).toContain(
      "spc-basics",
    );
    expect(dashboard.templateDownloads[0]).toMatchObject({
      stableId: "demo-template",
      downloadCount: 1,
      downloadUsers: 1,
    });
  });

  test("identity details are admin-only and limited to recent activity (STAT-06)", async () => {
    const stats = service();
    await expect(stats.listIdentitySearchDetail(EDITOR_ID, 10)).rejects.toThrow(
      /Administrator/i,
    );
    await expect(stats.listIdentityReachDetail(EDITOR_ID, 10)).rejects.toThrow(
      /Administrator/i,
    );

    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(30),
    });
    await createDatabaseClient(database)
      .insert(searchEvents)
      .values({
        id: "00000000-0000-4000-8000-0000000000a2",
        userId: READER_ID,
        query: "CPK",
        hasResults: false,
        createdAt: daysAgo(2),
      });

    const searches = await stats.listIdentitySearchDetail(ADMIN_ID, 10);
    expect(searches).toEqual([
      expect.objectContaining({
        query: "CPK",
        userName: "reader",
        hasResults: false,
      }),
    ]);
    const reach = await stats.listIdentityReachDetail(ADMIN_ID, 10);
    expect(reach).toEqual([
      expect.objectContaining({
        articleStableId: "anova-intro",
        userName: "reader",
      }),
    ]);
  });

  test("purge snapshots daily aggregates then removes identity detail (STAT-08/11)", async () => {
    const stats = service();
    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(120),
    });
    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: daysAgo(1),
    });
    await createDatabaseClient(database)
      .insert(searchEvents)
      .values({
        id: "00000000-0000-4000-8000-0000000000a3",
        userId: READER_ID,
        query: "旧词",
        hasResults: false,
        createdAt: daysAgo(120),
      });
    await createDatabaseClient(database)
      .insert(searchAggregates)
      .values({
        query: "旧词",
        hasResults: false,
        searchCount: 1,
        lastSearchedAt: daysAgo(120),
      });

    const summary = await stats.purgeIdentityDetails(ADMIN_ID, daysAgo(90));
    expect(summary.purgedReadEvents).toBe(1);
    expect(summary.purgedSearchEvents).toBe(1);

    const client = createDatabaseClient(database);
    const readEvents = await client.select().from(articleReadEvents);
    expect(readEvents.map((event) => event.readAt)).toEqual([daysAgo(1)]);
    const dailyReach = await client.select().from(articleDailyReach);
    expect(dailyReach).toHaveLength(2);
    expect(dailyReach.filter((row) => row.reachCount === 1)).toHaveLength(2);
    const aggregates = await client.select().from(searchAggregates);
    expect(aggregates).toHaveLength(1);
    // 聚合阅读总数不被清理（STAT-11：不得单独篡改统计数字）
    const article = (
      await client
        .select({ readCount: articles.readCount })
        .from(articles)
        .where(eq(articles.stableId, "anova-intro"))
    )[0];
    expect(article?.readCount).toBe(2);
  });

  test("aggregate export contains no identity data (STAT-07)", async () => {
    const stats = service();
    await stats.recordArticleRead({
      articleId: ARTICLE_ID,
      userId: READER_ID,
      instant: NOW,
    });
    const csv = await stats.exportAggregateStats(EDITOR_ID);
    expect(csv).toContain("类型,稳定标识,名称");
    expect(csv).toContain("文章,anova-intro,ANOVA 入门");
    expect(csv).not.toContain("reader");
    expect(csv).not.toContain(READER_ID);
  });
});
