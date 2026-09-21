import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { createDatabaseClient } from "@/db/client";
import { migrate } from "@/db/migrate";
import { articles, users } from "@/db/schema";
import { createContentStatsService } from "@/modules/content-stats";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for PostgreSQL tests.");
}

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const ADMIN_ID = "00000000-0000-4000-8000-0000000000f3";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const NOW = new Date("2026-08-19T02:00:00.000Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

/**
 * 这一组用例必须在真实 PostgreSQL（postgres.js 驱动）上运行：
 * 驱动只接受字符串/缓冲区参数，裸 Date 传进 drizzle 的 sql 模板会在参数编码时
 * 抛 ERR_INVALID_ARG_TYPE（线上阅读者打开文章 500 就是这个原因），
 * 而 PGlite 会容忍，所以只有在这里才能挡住这类回归。
 */
describe("content statistics on PostgreSQL 17", () => {
  let database: Sql;

  beforeAll(async () => {
    database = postgres(databaseUrl, { max: 5 });
    const name = await database<{ current_database: string }[]>`
      select current_database()
    `;
    if (!name[0]?.current_database.includes("test")) {
      throw new Error(
        "PostgreSQL tests require a database name containing test.",
      );
    }
    await database.unsafe("drop schema public cascade; create schema public");
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
        id: "00000000-0000-4000-8000-0000000000d3",
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
    // 90 天前的阅读明细（保留期外的历史数据，用于清理用例）
    await createContentStatsService(database).recordArticleRead({
      articleId: "00000000-0000-4000-8000-0000000000d3",
      userId: READER_ID,
      instant: daysAgo(100),
    });
  });

  afterAll(async () => {
    await database?.end();
  });

  test("records a reader's first read (STAT-01)", async () => {
    const stats = createContentStatsService(database);

    await expect(
      stats.recordArticleRead({
        articleId: ARTICLE_ID,
        userId: READER_ID,
        instant: NOW,
      }),
    ).resolves.toBe(true);

    // 30 分钟内重复阅读不重复计数
    await expect(
      stats.recordArticleRead({
        articleId: ARTICLE_ID,
        userId: READER_ID,
        instant: new Date(NOW.getTime() + 10 * 60 * 1000),
      }),
    ).resolves.toBe(false);

    const rows = await createDatabaseClient(database)
      .select({
        stableId: articles.stableId,
        readCount: articles.readCount,
      })
      .from(articles);
    expect(rows.find((row) => row.stableId === "anova-intro")?.readCount).toBe(
      1,
    );
  });

  test("builds the editor dashboard with date-filtered aggregates (STAT-04)", async () => {
    const stats = createContentStatsService(database);
    const dashboard = await stats.editorDashboard(EDITOR_ID, NOW);

    expect(dashboard.longUnreadArticles.map((row) => row.stableId)).toContain(
      "old-unread",
    );
    expect(dashboard.hotArticles.map((row) => row.stableId)).toContain(
      "anova-intro",
    );
  });

  test("purges identity details before the retention boundary (STAT-11)", async () => {
    const stats = createContentStatsService(database);
    const summary = await stats.purgeIdentityDetails(ADMIN_ID, daysAgo(90));

    // 只清理保留期外的那一条，最近这条（NOW）保留
    expect(summary.purgedReadEvents).toBe(1);
  });
});
