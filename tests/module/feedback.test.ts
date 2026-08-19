import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { articles, contentFeedback, users } from "@/db/schema";
import { createFeedbackService, type FeedbackType } from "@/modules/feedback";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const EDITOR_ID = "00000000-0000-4000-8000-0000000000f2";
const ARTICLE_ID = "00000000-0000-4000-8000-0000000000d1";
const DRAFT_ARTICLE_ID = "00000000-0000-4000-8000-0000000000d2";

describe("feedback service", () => {
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
        createdAt: new Date(),
      },
      {
        id: EDITOR_ID,
        username: "editor",
        normalizedUsername: "editor",
        displayName: "品质编辑",
        passwordHash: "hash",
        role: "editor",
        createdAt: new Date(),
      },
    ]);
    const now = new Date();
    const nextReviewAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
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
        nextReviewAt,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: DRAFT_ARTICLE_ID,
        stableId: "draft-article",
        title: "草稿",
        summary: "草稿",
        bodyMarkdown: "草稿正文",
        primaryTopicId: "00000000-0000-4000-8000-000000000c04",
        tags: [],
        contentOwnerId: EDITOR_ID,
        status: "draft",
        updatedAt: now,
        createdAt: now,
      },
    ]);
  });

  afterEach(async () => {
    await database.close();
  });

  function service() {
    return createFeedbackService(database);
  }

  test("submits all five feedback types with required description (FDBK-01)", async () => {
    const types: FeedbackType[] = [
      "error",
      "outdated",
      "unclear",
      "missing",
      "other",
    ];
    for (const feedbackType of types) {
      await service().submitFeedback({
        articleId: ARTICLE_ID,
        reporterUserId: READER_ID,
        feedbackType,
        description: `${feedbackType} 说明`,
        occurredAt: new Date("2026-08-19T02:00:00.000Z"),
      });
    }

    const rows = await createDatabaseClient(database)
      .select()
      .from(contentFeedback);
    expect(rows).toHaveLength(5);
    expect(rows.every((row) => row.status === "pending")).toBe(true);
    expect(rows.map((row) => row.feedbackType).sort()).toEqual([
      "error",
      "missing",
      "other",
      "outdated",
      "unclear",
    ]);
  });

  test("rejects blank descriptions and non-published articles", async () => {
    await expect(
      service().submitFeedback({
        articleId: ARTICLE_ID,
        reporterUserId: READER_ID,
        feedbackType: "error",
        description: "   ",
      }),
    ).rejects.toThrow(/Invalid|无效|description/i);

    await expect(
      service().submitFeedback({
        articleId: DRAFT_ARTICLE_ID,
        reporterUserId: READER_ID,
        feedbackType: "error",
        description: "草稿上的反馈",
      }),
    ).rejects.toThrow(/已发布|not available/i);
  });

  test("records article, reporter, time and status (FDBK-02)", async () => {
    await service().submitFeedback({
      articleId: ARTICLE_ID,
      reporterUserId: READER_ID,
      feedbackType: "outdated",
      description: "数据口径已变化",
      occurredAt: new Date("2026-08-19T02:00:00.000Z"),
    });

    const items = await service().listFeedback({
      requestingUserId: EDITOR_ID,
    });
    expect(items).toEqual([
      expect.objectContaining({
        articleStableId: "anova-intro",
        articleTitle: "ANOVA 入门",
        reporterName: "reader",
        feedbackType: "outdated",
        description: "数据口径已变化",
        status: "pending",
      }),
    ]);
    expect(items[0]!.createdAt).toEqual(new Date("2026-08-19T02:00:00.000Z"));
  });

  test("editor resolves or ignores pending feedback with a note (FDBK-03)", async () => {
    await service().submitFeedback({
      articleId: ARTICLE_ID,
      reporterUserId: READER_ID,
      feedbackType: "error",
      description: "公式有误",
    });
    const items = await service().listFeedback({
      requestingUserId: EDITOR_ID,
    });

    await service().resolveFeedback({
      feedbackId: items[0]!.id,
      handledBy: EDITOR_ID,
      status: "resolved",
      note: "已修正",
    });
    const resolved = await service().listFeedback({
      requestingUserId: EDITOR_ID,
      status: "resolved",
    });
    expect(resolved[0]).toMatchObject({
      status: "resolved",
      handledBy: EDITOR_ID,
      handledAt: expect.any(Date),
      resolutionNote: "已修正",
    });
    expect(resolved[0]!.description).toBe("公式有误");
    expect(resolved[0]!.handledAt).not.toBeNull();
  });

  test("readers cannot list or process feedback", async () => {
    await expect(
      service().listFeedback({ requestingUserId: READER_ID }),
    ).rejects.toThrow(/Editor privileges/i);
    await expect(
      service().resolveFeedback({
        feedbackId: "00000000-0000-4000-8000-0000000000a1",
        handledBy: READER_ID,
        status: "ignored",
      }),
    ).rejects.toThrow(/Editor privileges/i);
  });

  test("only pending feedback can be resolved", async () => {
    await service().submitFeedback({
      articleId: ARTICLE_ID,
      reporterUserId: READER_ID,
      feedbackType: "missing",
      description: "缺少案例",
    });
    const items = await service().listFeedback({
      requestingUserId: EDITOR_ID,
    });
    await service().resolveFeedback({
      feedbackId: items[0]!.id,
      handledBy: EDITOR_ID,
      status: "ignored",
      note: "暂不补充",
    });
    await expect(
      service().resolveFeedback({
        feedbackId: items[0]!.id,
        handledBy: EDITOR_ID,
        status: "resolved",
      }),
    ).rejects.toThrow(/待处理|pending/i);
  });
});
