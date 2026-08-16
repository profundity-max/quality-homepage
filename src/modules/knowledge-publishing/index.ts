import type { PGlite } from "@electric-sql/pglite";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { articles, articleAliases, sections, topics, users } from "@/db/schema";

export type TopicSummary = {
  id: string;
  stableId: string;
  name: string;
};

export type SectionNode = {
  id: string;
  stableId: string;
  name: string;
  parentId: string | null;
  children: SectionNode[];
  topics: TopicSummary[];
};

export type ArticleSummary = {
  id: string;
  stableId: string;
  title: string;
  summary: string;
  topicName: string;
  topicStableId: string;
  updatedAt: Date;
};

export type PublishedArticle = {
  id: string;
  stableId: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  topicName: string;
  topicStableId: string;
  sectionName: string;
  tags: string[];
  aliases: string[];
  ownerDisplayName: string;
  updatedAt: Date;
  nextReviewAt: Date | null;
  publishedAt: Date | null;
  readCount: number;
};

export type AdjacentArticles = {
  previous: ArticleSummary | null;
  next: ArticleSummary | null;
};

export type KnowledgePublishingService = {
  /** 按栏目组织的主题树；只包含有已发布文章的栏目与主题（IA-08）。 */
  listTopicTree(): Promise<SectionNode[]>;
  /** 主题下的已发布文章，按更新时间倒序。 */
  listArticlesByTopic(topicId: string): Promise<ArticleSummary[]>;
  /** 仅返回已发布版本（VER-02 读取侧）；草稿与归档返回 null。 */
  getPublishedArticleByStableId(
    stableId: string,
  ): Promise<PublishedArticle | null>;
  /** 全站最近更新的已发布文章，按更新时间倒序。 */
  listRecentUpdates(limit: number): Promise<ArticleSummary[]>;
  /** 相关文章：同主题优先，其次共享标签（ART-06）。 */
  listRelatedArticles(stableId: string): Promise<ArticleSummary[]>;
  /** 阅读次数 +1（ART-06 基础计数）；非已发布文章不生效。 */
  recordRead(stableId: string): Promise<void>;
  /** 同主题内按更新时间排序的上一篇与下一篇（ART-06）。 */
  getAdjacentArticles(stableId: string): Promise<AdjacentArticles>;
};

const publishedWhere = eq(articles.status, "published");
const defaultListLimit = 100;

const articleSummaryColumns = {
  id: articles.id,
  stableId: articles.stableId,
  title: articles.title,
  summary: articles.summary,
  topicName: topics.name,
  topicStableId: topics.stableId,
  updatedAt: articles.updatedAt,
} as const;

function listPublishedSummaries(
  client: ReturnType<typeof createDatabaseClient>,
  extraWhere: SQL | undefined,
  limit: number,
) {
  return client
    .select(articleSummaryColumns)
    .from(articles)
    .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
    .where(and(publishedWhere, ...(extraWhere ? [extraWhere] : [])))
    .orderBy(desc(articles.updatedAt))
    .limit(limit);
}

export function createKnowledgePublishingService(
  database: PGlite | Sql,
): KnowledgePublishingService {
  const client = createDatabaseClient(database);

  async function buildTopicTree(): Promise<SectionNode[]> {
    const allSections = await client
      .select({
        id: sections.id,
        stableId: sections.stableId,
        name: sections.name,
        parentId: sections.parentId,
      })
      .from(sections)
      .where(isNull(sections.archivedAt))
      .orderBy(asc(sections.sortOrder));

    const topicsWithSection = await client
      .select({
        id: topics.id,
        stableId: topics.stableId,
        name: topics.name,
        sectionId: topics.sectionId,
      })
      .from(topics)
      .where(isNull(topics.archivedAt))
      .orderBy(asc(topics.sortOrder));

    const topicIdsWithContent = await client
      .selectDistinct({ topicId: articles.primaryTopicId })
      .from(articles)
      .where(publishedWhere);

    const visibleTopicIds = new Set(
      topicIdsWithContent.map((row) => row.topicId),
    );

    const topicBySection = new Map<string, TopicSummary[]>();
    for (const topic of topicsWithSection) {
      if (!visibleTopicIds.has(topic.id)) continue;
      const list = topicBySection.get(topic.sectionId) ?? [];
      list.push({ id: topic.id, stableId: topic.stableId, name: topic.name });
      topicBySection.set(topic.sectionId, list);
    }

    const sectionById = new Map(
      allSections.map((section) => [section.id, section]),
    );

    function buildNode(sectionId: string): SectionNode | null {
      const section = sectionById.get(sectionId);
      if (!section) throw new Error(`Unknown section id: ${sectionId}`);
      const children = allSections
        .filter((candidate) => candidate.parentId === sectionId)
        .map((candidate) => buildNode(candidate.id))
        .filter((candidate): candidate is SectionNode => candidate !== null);
      const topicsForSection = topicBySection.get(sectionId) ?? [];
      if (children.length === 0 && topicsForSection.length === 0) return null;
      return {
        id: sectionId,
        stableId: section.stableId,
        name: section.name,
        parentId: section.parentId,
        children,
        topics: topicsForSection,
      };
    }

    return allSections
      .filter((section) => section.parentId === null)
      .map((section) => buildNode(section.id))
      .filter((section): section is SectionNode => section !== null);
  }

  return {
    async listTopicTree() {
      return buildTopicTree();
    },

    async listArticlesByTopic(topicId) {
      return listPublishedSummaries(
        client,
        eq(articles.primaryTopicId, topicId),
        defaultListLimit,
      );
    },

    async getPublishedArticleByStableId(stableId) {
      const rows = await client
        .select({
          id: articles.id,
          stableId: articles.stableId,
          title: articles.title,
          summary: articles.summary,
          bodyMarkdown: articles.bodyMarkdown,
          topicName: topics.name,
          topicStableId: topics.stableId,
          sectionName: sections.name,
          tags: articles.tags,
          ownerDisplayName: sql<string>`coalesce(
            ${users.displayName}, ${users.username}
          )`,
          readCount: articles.readCount,
          updatedAt: articles.updatedAt,
          nextReviewAt: articles.nextReviewAt,
          publishedAt: articles.publishedAt,
        })
        .from(articles)
        .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
        .innerJoin(sections, eq(topics.sectionId, sections.id))
        .leftJoin(users, eq(articles.contentOwnerId, users.id))
        .where(and(eq(articles.stableId, stableId), publishedWhere))
        .limit(1);
      const row = rows[0];
      if (!row) return null;

      const aliasRows = await client
        .select({ alias: articleAliases.alias })
        .from(articleAliases)
        .where(eq(articleAliases.articleId, row.id))
        .orderBy(asc(articleAliases.alias));

      return {
        id: row.id,
        stableId: row.stableId,
        title: row.title,
        summary: row.summary,
        bodyMarkdown: row.bodyMarkdown,
        topicName: row.topicName,
        topicStableId: row.topicStableId,
        sectionName: row.sectionName,
        tags: row.tags,
        aliases: aliasRows.map((aliasRow) => aliasRow.alias),
        ownerDisplayName: row.ownerDisplayName,
        updatedAt: row.updatedAt,
        nextReviewAt: row.nextReviewAt,
        publishedAt: row.publishedAt,
        readCount: row.readCount,
      };
    },

    async listRecentUpdates(limit) {
      return listPublishedSummaries(client, undefined, limit);
    },

    async listRelatedArticles(stableId) {
      const source = (
        await client
          .select({
            topicId: articles.primaryTopicId,
            tags: articles.tags,
          })
          .from(articles)
          .where(and(eq(articles.stableId, stableId), publishedWhere))
          .limit(1)
      )[0];
      if (!source) return [];

      const sameTopic = await listPublishedSummaries(
        client,
        and(
          eq(articles.primaryTopicId, source.topicId),
          ne(articles.stableId, stableId),
        ),
        100,
      );

      const sharedTag = await listPublishedSummaries(
        client,
        and(
          ne(articles.primaryTopicId, source.topicId),
          ne(articles.stableId, stableId),
          or(
            ...(source.tags.length > 0
              ? source.tags.map((tag) => sql`${articles.tags} @> ARRAY[${tag}]`)
              : [sql`false`]),
          ),
        ),
        defaultListLimit,
      );

      return [...sameTopic, ...sharedTag];
    },

    async recordRead(stableId) {
      await client
        .update(articles)
        .set({ readCount: sql`${articles.readCount} + 1` })
        .where(and(eq(articles.stableId, stableId), publishedWhere));
    },

    async getAdjacentArticles(stableId) {
      const source = (
        await client
          .select({
            topicId: articles.primaryTopicId,
            updatedAt: articles.updatedAt,
          })
          .from(articles)
          .where(and(eq(articles.stableId, stableId), publishedWhere))
          .limit(1)
      )[0];
      if (!source) return { previous: null, next: null };

      // 同主题内按更新时间升序，阅读顺序即时间顺序
      const siblings = await client
        .select(articleSummaryColumns)
        .from(articles)
        .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
        .where(and(publishedWhere, eq(articles.primaryTopicId, source.topicId)))
        .orderBy(asc(articles.updatedAt));
      const index = siblings.findIndex(
        (article) => article.stableId === stableId,
      );
      return {
        previous: index > 0 ? siblings[index - 1] : null,
        next:
          index >= 0 && index < siblings.length - 1
            ? siblings[index + 1]
            : null,
      };
    },
  };
}
