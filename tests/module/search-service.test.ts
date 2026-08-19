import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { migrate } from "@/db/migrate";
import { createDatabaseClient } from "@/db/client";
import {
  articleAliases,
  articles,
  books,
  searchAggregates,
  searchEvents,
  templateVersions,
  templates,
  users,
} from "@/db/schema";
import { createSearchService } from "@/modules/search";

const READER_ID = "00000000-0000-4000-8000-0000000000f1";
const NOW = new Date("2026-08-19T02:00:00.000Z");

const anovaTopicId = "00000000-0000-4000-8000-000000000c04";
const spcTopicId = "00000000-0000-4000-8000-000000000c12";
const msaTopicId = "00000000-0000-4000-8000-000000000c07";
const sigmaTopicId = "00000000-0000-4000-8000-000000000c01";

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

async function seedDatabase(database: PGlite) {
  const client = createDatabaseClient(database);
  await client.insert(users).values({
    id: READER_ID,
    username: "reader",
    normalizedUsername: "reader",
    passwordHash: "hash",
    role: "reader",
    createdAt: NOW,
  });

  const article = (
    id: string,
    stableId: string,
    title: string,
    summary: string,
    body: string,
    topicId: string,
    tags: string[],
    updatedDaysAgo: number,
    status: "published" | "draft" = "published",
  ) =>
    client.insert(articles).values({
      id,
      stableId,
      title,
      summary,
      bodyMarkdown: body,
      primaryTopicId: topicId,
      tags,
      contentOwnerId: READER_ID,
      status,
      nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
      updatedAt: daysAgo(updatedDaysAgo),
      createdAt: daysAgo(updatedDaysAgo + 7),
    });

  await Promise.all([
    article(
      "00000000-0000-4000-8000-0000000000d1",
      "spc-basics",
      "SPC 控制图入门",
      "统计过程控制的基础概念",
      "控制图用于监控过程是否稳定。",
      spcTopicId,
      ["统计"],
      3,
    ),
    article(
      "00000000-0000-4000-8000-0000000000d2",
      "anova-quick-guide",
      "方差分析快速指南",
      "ANOVA 的适用前提",
      "比较多个组的均值是否存在显著差异。",
      anovaTopicId,
      ["统计"],
      10,
    ),
    article(
      "00000000-0000-4000-8000-0000000000d3",
      "msa-notes",
      "测量系统分析笔记",
      "量具 R&R 的读数方法",
      "测量系统分析用于判断量具能力。",
      msaTopicId,
      ["测量"],
      60,
    ),
    article(
      "00000000-0000-4000-8000-0000000000d4",
      "sigma-basics",
      "标准差与正态分布",
      "σ、Sigma 与分布的关系",
      "标准差衡量数据的离散程度。",
      sigmaTopicId,
      ["统计"],
      1,
    ),
    article(
      "00000000-0000-4000-8000-0000000000d5",
      "draft-article",
      "尚未发布的草稿",
      "草稿内容",
      "草稿正文",
      anovaTopicId,
      [],
      0,
      "draft",
    ),
  ]);

  await client.insert(templates).values({
    id: "00000000-0000-4000-8000-0000000000e1",
    stableId: "inspection-report",
    name: "检验报告模板",
    purpose: "用于来料检验记录",
    usageScenario: "IQC 场景",
    categoryId: "00000000-0000-4000-8000-0000000000a1",
    contentOwnerId: READER_ID,
    status: "published",
    nextReviewAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000),
    updatedAt: daysAgo(5),
    createdAt: daysAgo(12),
  });
  await client.insert(templateVersions).values({
    id: "00000000-0000-4000-8000-0000000000e2",
    templateId: "00000000-0000-4000-8000-0000000000e1",
    version: 1,
    versionLabel: "1.0",
    changeNote: "初版发布，覆盖 IQC 检验记录",
    fileName: "inspection.xlsx",
    extension: "xlsx",
    byteSize: 1024,
    sha256: "a".repeat(64),
    status: "active",
    quarantineState: "passed",
    createdAt: daysAgo(5),
  });

  await client.insert(books).values({
    id: "00000000-0000-4000-8000-0000000000f1",
    stableId: "statistical-thinking",
    title: "统计思维：用数据做判断",
    author: "张三",
    recommendation: "适合品质工程师建立数据思维",
    audience: "品质部全员",
    categoryId: "00000000-0000-4000-8000-0000000000a2",
    tags: ["统计", "数据"],
    recommendedBy: READER_ID,
    updatedAt: daysAgo(2),
    createdAt: daysAgo(20),
  });

  await client.insert(articleAliases).values([
    {
      id: "00000000-0000-4000-8000-0000000000b1",
      articleId: "00000000-0000-4000-8000-0000000000d2",
      alias: "ANOVA 指南",
    },
  ]);
}

describe("search service", () => {
  let database: PGlite;

  beforeEach(async () => {
    database = new PGlite();
    await migrate(database);
    await seedDatabase(database);
  });

  afterEach(async () => {
    await database.close();
  });

  function service() {
    return createSearchService(database);
  }

  test("matches articles by title, summary and body (SEARCH-01)", async () => {
    const byTitle = await service().quickSearch("控制图");
    expect(byTitle.articles.map((hit) => hit.stableId)).toContain("spc-basics");

    const bySummary = await service().quickSearch("量具 R&R");
    expect(bySummary.articles.map((hit) => hit.stableId)).toContain(
      "msa-notes",
    );

    const byBody = await service().quickSearch("显著差异");
    expect(byBody.articles.map((hit) => hit.stableId)).toContain(
      "anova-quick-guide",
    );
    expect(byBody.articles.map((hit) => hit.snippet)).not.toContain(null);
  });

  test("never returns draft articles (VER-02/IA-08)", async () => {
    const result = await service().quickSearch("草稿");
    expect(result.articles).toHaveLength(0);
  });

  test("matches the same knowledge through Chinese, symbol and English aliases (SEARCH-04)", async () => {
    for (const query of ["标准差", "σ", "Sigma"]) {
      const result = await service().quickSearch(query);
      const topics = result.topics.filter(
        (hit) =>
          hit.stableId === sigmaTopicId ||
          hit.stableId === "mean-sigma-distribution-ci-normal-distribution",
      );
      expect(topics.length).toBeGreaterThan(0);
      expect(topics[0]!.matchedAlias).toBe(query);
    }
  });

  test("groups quick results by article, topic, template and book (SEARCH-05)", async () => {
    const result = await service().quickSearch("统计");
    expect(result.articles.length).toBeGreaterThan(0);
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.books.length).toBeGreaterThan(0);
    expect(result.articles.every((hit) => hit.kind === "article")).toBe(true);
    expect(result.topics.every((hit) => hit.kind === "topic")).toBe(true);
    expect(result.books.every((hit) => hit.kind === "book")).toBe(true);
  });

  test("filters full results by content type (SEARCH-06)", async () => {
    const result = await service().fullSearch("检验", {
      types: ["templates"],
    });
    expect(result.templates.map((hit) => hit.stableId)).toContain(
      "inspection-report",
    );
    expect(result.articles).toHaveLength(0);
    expect(result.books).toHaveLength(0);
  });

  test("filters full results by tag and section", async () => {
    const byTag = await service().fullSearch("统计", {
      types: ["books"],
      tag: "数据",
    });
    expect(byTag.books).toHaveLength(1);
    expect(byTag.books[0]!.stableId).toBe("statistical-thinking");

    const byTagNoMatch = await service().fullSearch("统计", {
      types: ["books"],
      tag: "测量",
    });
    expect(byTagNoMatch.books).toHaveLength(0);

    const anovaSectionId = "00000000-0000-4000-8000-0000000000b1";
    const bySection = await service().fullSearch("统计", {
      types: ["articles"],
      sectionId: anovaSectionId,
    });
    expect(bySection.articles.map((hit) => hit.stableId)).toContain(
      "anova-quick-guide",
    );
    expect(bySection.articles.map((hit) => hit.stableId)).not.toContain(
      "msa-notes",
    );
  });

  test("filters by updatedWithinDays", async () => {
    const result = await service().fullSearch("测量", {
      types: ["articles"],
      updatedWithinDays: 30,
    });
    expect(result.articles.map((hit) => hit.stableId)).not.toContain(
      "msa-notes",
    );
  });

  test("matches templates by name, purpose and version note without reading file content (SEARCH-02)", async () => {
    const byName = await service().quickSearch("检验报告");
    expect(byName.templates.map((hit) => hit.stableId)).toContain(
      "inspection-report",
    );

    const byPurpose = await service().quickSearch("来料检验");
    expect(byPurpose.templates.map((hit) => hit.stableId)).toContain(
      "inspection-report",
    );

    const byChangeNote = await service().quickSearch("IQC 检验记录");
    expect(byChangeNote.templates.map((hit) => hit.stableId)).toContain(
      "inspection-report",
    );
  });

  test("matches books by title, author, recommendation and tags (SEARCH-03)", async () => {
    const byAuthor = await service().quickSearch("张三");
    expect(byAuthor.books.map((hit) => hit.stableId)).toContain(
      "statistical-thinking",
    );
    const byTag = await service().quickSearch("数据");
    expect(byTag.books.map((hit) => hit.stableId)).toContain(
      "statistical-thinking",
    );
  });

  test("records searches and aggregates anonymous totals (STAT-09/08)", async () => {
    const search = service();
    await search.recordSearch({
      userId: READER_ID,
      query: "CPK",
      hasResults: false,
      occurredAt: NOW,
    });
    await search.recordSearch({
      userId: READER_ID,
      query: "CPK",
      hasResults: false,
      note: "希望补充过程能力教程",
      occurredAt: new Date(NOW.getTime() + 60_000),
    });

    const events = await createDatabaseClient(database)
      .select()
      .from(searchEvents);
    expect(events).toHaveLength(2);
    expect(events[1]?.note).toBe("希望补充过程能力教程");

    const aggregates = await createDatabaseClient(database)
      .select()
      .from(searchAggregates);
    expect(aggregates).toEqual([
      expect.objectContaining({
        query: "CPK",
        hasResults: false,
        searchCount: 2,
      }),
    ]);
  });

  test("attaches a knowledge-gap note to the latest matching search (SEARCH-07)", async () => {
    const search = service();
    await search.recordSearch({
      userId: READER_ID,
      query: "TVC 均热板",
      hasResults: false,
      occurredAt: NOW,
    });
    await search.addSearchNote({
      userId: READER_ID,
      query: "TVC 均热板",
      note: "希望补充超薄均热板工艺资料",
    });

    const events = await createDatabaseClient(database)
      .select()
      .from(searchEvents);
    expect(events).toHaveLength(1);
    expect(events[0]?.note).toBe("希望补充超薄均热板工艺资料");
  });

  test("suggests possible aliases when there are no results (SEARCH-07)", async () => {
    const suggestions = await service().suggestAliases("标准");
    expect(suggestions).toContain("标准差");
    expect(suggestions).toContain("σ");
    const sigmaSuggestions = await service().suggestAliases("sigma");
    expect(sigmaSuggestions).toContain("Sigma");
  });

  test("lists no-result search terms for the editor dashboard (STAT-04)", async () => {
    const search = service();
    await search.recordSearch({
      userId: READER_ID,
      query: "热管工艺",
      hasResults: false,
      occurredAt: NOW,
    });
    await search.recordSearch({
      userId: READER_ID,
      query: "热管工艺",
      hasResults: false,
      occurredAt: new Date(NOW.getTime() + 60_000),
    });
    await search.recordSearch({
      userId: READER_ID,
      query: "TVC 设备预约",
      hasResults: false,
      occurredAt: new Date(NOW.getTime() + 120_000),
    });

    const terms = await search.listNoResultTerms(10);
    expect(terms[0]).toMatchObject({ query: "热管工艺", count: 2 });
    expect(terms.map((term) => term.query)).toContain("TVC 设备预约");
  });
});
