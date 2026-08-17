import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import { articles, articleAliases, sections, users } from "@/db/schema";
import { createKnowledgePublishingService } from "@/modules/knowledge-publishing";

const anovaTopicId = "00000000-0000-4000-8000-000000000c04";
const spcTopicId = "00000000-0000-4000-8000-000000000c12";
const ownerId = "00000000-0000-4000-8000-0000000000f1";

describe("knowledge publishing read service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    const client = createDatabaseClient(database);

    await client.insert(users).values({
      id: ownerId,
      username: "owner",
      normalizedUsername: "owner",
      passwordHash: "hash",
      role: "editor",
      createdAt: new Date(),
    });

    // 已发布文章（ANOVA 主题）
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d1",
      stableId: "anova-intro",
      title: "ANOVA 入门",
      summary: "方差分析基础概念",
      bodyMarkdown: "正文一",
      primaryTopicId: anovaTopicId,
      tags: ["统计", "入门"],
      contentOwnerId: ownerId,
      status: "published",
      nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
      publishedAt: new Date("2026-08-10T00:00:00.000Z"),
      updatedAt: new Date("2026-08-10T00:00:00.000Z"),
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    // 同主题第二篇已发布文章
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d2",
      stableId: "anova-example",
      title: "ANOVA 实例",
      summary: "一个完整例子",
      bodyMarkdown: "正文二",
      primaryTopicId: anovaTopicId,
      tags: ["统计", "实战"],
      contentOwnerId: ownerId,
      status: "published",
      nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
      publishedAt: new Date("2026-08-12T00:00:00.000Z"),
      updatedAt: new Date("2026-08-12T00:00:00.000Z"),
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
    });

    // 另一主题（SPC）已发布文章，共享标签「统计」
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d3",
      stableId: "spc-basics",
      title: "SPC 基础",
      summary: "过程控制入门",
      bodyMarkdown: "正文三",
      primaryTopicId: spcTopicId,
      tags: ["统计", "过程控制"],
      contentOwnerId: ownerId,
      status: "published",
      nextReviewAt: new Date("2027-01-01T00:00:00.000Z"),
      publishedAt: new Date("2026-08-08T00:00:00.000Z"),
      updatedAt: new Date("2026-08-08T00:00:00.000Z"),
      createdAt: new Date("2026-08-03T00:00:00.000Z"),
    });

    // 草稿与已归档文章（不应出现在任何阅读入口）
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d4",
      stableId: "anova-draft",
      title: "ANOVA 草稿",
      summary: "未发布",
      bodyMarkdown: "草稿正文",
      primaryTopicId: anovaTopicId,
      tags: ["统计"],
      contentOwnerId: ownerId,
      status: "draft",
      updatedAt: new Date("2026-08-05T00:00:00.000Z"),
      createdAt: new Date("2026-08-05T00:00:00.000Z"),
    });
    await client.insert(articles).values({
      id: "00000000-0000-4000-8000-0000000000d5",
      stableId: "anova-archived",
      title: "ANOVA 旧文",
      summary: "已归档",
      bodyMarkdown: "归档正文",
      primaryTopicId: anovaTopicId,
      tags: ["统计"],
      contentOwnerId: ownerId,
      status: "archived",
      publishedAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-08-07T00:00:00.000Z"),
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    // 文章别名
    await client.insert(articleAliases).values([
      {
        id: "00000000-0000-4000-8000-000000000e01",
        articleId: "00000000-0000-4000-8000-0000000000d1",
        alias: "方差分析入门",
      },
    ]);
  });

  afterEach(async () => {
    await database.close();
  });

  test("lists sections with topics that have published articles only", async () => {
    const service = createKnowledgePublishingService(database);
    const tree = await service.listTopicTree();

    const quality = tree.find(
      (section) => section.stableId === "quality-knowledge",
    );
    expect(quality).toBeDefined();
    expect(quality!.name).toBe("品质知识");

    const dataAndStatistics = quality!.children.find(
      (child) => child.stableId === "data-and-statistics",
    );
    expect(dataAndStatistics).toBeDefined();
    expect(dataAndStatistics!.topics.map((topic) => topic.stableId)).toEqual([
      "anova",
    ]);

    // 散热知识没有任何已发布文章，整个栏目从阅读树中剪除（IA-08）
    expect(
      tree.find((section) => section.stableId === "thermal-knowledge"),
    ).toBeUndefined();
  });

  test("returns published article summaries ordered by update time", async () => {
    const service = createKnowledgePublishingService(database);
    const list = await service.listArticlesByTopic(anovaTopicId);

    expect(list.map((article) => article.stableId)).toEqual([
      "anova-example",
      "anova-intro",
    ]);
    const first = list[0]!;
    expect(first.title).toBe("ANOVA 实例");
    expect(first.topicName).toBe("ANOVA");
  });

  test("returns the published article by stable id with its topic", async () => {
    const service = createKnowledgePublishingService(database);
    const article = await service.getPublishedArticleByStableId("anova-intro");

    expect(article).not.toBeNull();
    expect(article!.title).toBe("ANOVA 入门");
    expect(article!.topicName).toBe("ANOVA");
    expect(article!.sectionName).toBe("数据与统计基础");
    expect(article!.bodyMarkdown).toBe("正文一");
    expect(article!.aliases).toEqual(["方差分析入门"]);
    expect(article!.ownerDisplayName).toBe("owner");
  });

  test("does not return draft or archived articles", async () => {
    const service = createKnowledgePublishingService(database);
    await expect(
      service.getPublishedArticleByStableId("anova-draft"),
    ).resolves.toBeNull();
    await expect(
      service.getPublishedArticleByStableId("anova-archived"),
    ).resolves.toBeNull();
  });

  test("returns recent updates across all published articles", async () => {
    const service = createKnowledgePublishingService(database);
    const recent = await service.listRecentUpdates(10);

    expect(recent.map((article) => article.stableId)).toEqual([
      "anova-example",
      "anova-intro",
      "spc-basics",
    ]);
  });

  test("ranks related articles by shared topic first, then shared tags", async () => {
    const service = createKnowledgePublishingService(database);
    const related = await service.listRelatedArticles("anova-intro");

    // 同主题：ANOVA 实例；跨主题共享标签「统计」：SPC 基础
    expect(related.map((article) => article.stableId)).toEqual([
      "anova-example",
      "spc-basics",
    ]);
  });

  test("returns shared-tag matches when no same-topic article exists", async () => {
    const service = createKnowledgePublishingService(database);
    const related = await service.listRelatedArticles("spc-basics");
    // SPC 主题下没有其他已发布文章；跨主题共享「统计」的 ANOVA 两篇
    expect(related.map((article) => article.stableId)).toEqual([
      "anova-example",
      "anova-intro",
    ]);
  });

  test("returns an empty related list when nothing matches", async () => {
    const service = createKnowledgePublishingService(database);
    await expect(
      service.listRelatedArticles("does-not-exist"),
    ).resolves.toEqual([]);
  });

  test("returns empty tree when no content exists", async () => {
    const empty = new PGlite();
    await migrate(empty);
    const service = createKnowledgePublishingService(empty);
    await expect(service.listTopicTree()).resolves.toEqual([]);
    await empty.close();
  });

  test("hides archived sections from the reader tree", async () => {
    const client = createDatabaseClient(database);
    await client
      .update(sections)
      .set({ archivedAt: new Date() })
      .where(eq(sections.stableId, "data-and-statistics"));

    const service = createKnowledgePublishingService(database);
    const tree = await service.listTopicTree();
    const quality = tree.find(
      (section) => section.stableId === "quality-knowledge",
    );
    expect(quality).toBeDefined();
    expect(quality!.children.map((child) => child.stableId)).not.toContain(
      "data-and-statistics",
    );
  });

  test("exposes the stable id of the knowledge home sections", async () => {
    const service = createKnowledgePublishingService(database);
    const tree = await service.listTopicTree();
    expect(
      tree
        .filter((section) => section.parentId === null)
        .map((section) => section.stableId),
    ).toEqual(["quality-knowledge"]);
  });

  test("records reads and reports the read count", async () => {
    const service = createKnowledgePublishingService(database);
    const before = await service.getPublishedArticleByStableId("anova-intro");
    expect(before!.readCount).toBe(0);

    await service.recordRead("anova-intro");
    await service.recordRead("anova-intro");

    const after = await service.getPublishedArticleByStableId("anova-intro");
    expect(after!.readCount).toBe(2);
  });

  test("ignores read recording for non-published articles", async () => {
    const service = createKnowledgePublishingService(database);
    await expect(service.recordRead("anova-draft")).resolves.toBeUndefined();
    await expect(service.recordRead("does-not-exist")).resolves.toBeUndefined();
  });

  test("returns adjacent articles within the same topic ordered by update time", async () => {
    const service = createKnowledgePublishingService(database);
    // 同主题 ANOVA 有两篇：anova-intro(8-10) 在前，anova-example(8-12) 在后
    const aroundIntro = await service.getAdjacentArticles("anova-intro");
    expect(aroundIntro.previous).toBeNull();
    expect(aroundIntro.next?.stableId).toBe("anova-example");

    const aroundExample = await service.getAdjacentArticles("anova-example");
    expect(aroundExample.previous?.stableId).toBe("anova-intro");
    expect(aroundExample.next).toBeNull();
  });

  test("lists all published articles for the internal-link picker", async () => {
    const service = createKnowledgePublishingService(database);
    const all = await service.listAllPublishedArticles(50);
    expect(all.map((article) => article.stableId).sort()).toEqual([
      "anova-example",
      "anova-intro",
      "spc-basics",
    ]);
  });
});
