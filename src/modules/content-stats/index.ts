import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { requireRole } from "@/modules/access";
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

const thirtyMinutesMs = 30 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

export type ReachStats = {
  d7: number;
  d30: number;
  d90: number;
  all: number;
};

export type DashboardArticleRow = {
  stableId: string;
  title: string;
  value: number;
};

export type EditorDashboard = {
  hotArticles: { stableId: string; title: string; readCount: number }[];
  highReachArticles: DashboardArticleRow[];
  growingArticles: {
    stableId: string;
    title: string;
    recentReads: number;
    previousReads: number;
  }[];
  longUnreadArticles: {
    stableId: string;
    title: string;
    publishedAt: Date;
  }[];
  searchDrivenOpens: DashboardArticleRow[];
  noResultTerms: {
    query: string;
    count: number;
    lastSearchedAt: Date;
  }[];
  templateDownloads: {
    stableId: string;
    name: string;
    downloadCount: number;
    downloadUsers: number;
  }[];
};

export type IdentitySearchRecord = {
  query: string;
  userName: string;
  hasResults: boolean;
  note: string | null;
  createdAt: Date;
};

export type IdentityReachRecord = {
  articleStableId: string;
  articleTitle: string;
  userName: string;
  readAt: Date;
};

export type PurgeSummary = {
  purgedReadEvents: number;
  purgedSearchEvents: number;
  purgedDownloadEvents: number;
};

export type ContentStatsService = {
  recordArticleRead(input: {
    articleId: string;
    userId: string;
    instant?: Date;
  }): Promise<boolean>;
  recordTemplateDownload(input: {
    templateVersionId: string;
    userId: string;
    instant?: Date;
  }): Promise<void>;
  reachStats(articleId: string, instant?: Date): Promise<ReachStats>;
  editorDashboard(
    requestingUserId: string,
    instant?: Date,
  ): Promise<EditorDashboard>;
  listIdentitySearchDetail(
    requestingUserId: string,
    limit?: number,
  ): Promise<IdentitySearchRecord[]>;
  listIdentityReachDetail(
    requestingUserId: string,
    limit?: number,
  ): Promise<IdentityReachRecord[]>;
  purgeIdentityDetails(
    requestingUserId: string,
    before: Date,
  ): Promise<PurgeSummary>;
  exportAggregateStats(requestingUserId: string): Promise<string>;
};

const visibleArticleCondition = or(
  eq(articles.status, "published"),
  and(eq(articles.status, "draft"), sql`${articles.publishedAt} is not null`),
);

async function assertEditor(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "editor");
}

async function assertAdministrator(
  client: ReturnType<typeof createDatabaseClient>,
  requestingUserId: string,
): Promise<void> {
  return requireRole(client, requestingUserId, "administrator");
}

export function createContentStatsService(
  database: PGlite | Sql,
): ContentStatsService {
  const client = createDatabaseClient(database);

  return {
    async recordArticleRead({ articleId, userId, instant = new Date() }) {
      const article = (
        await client
          .select({ id: articles.id })
          .from(articles)
          .where(and(eq(articles.id, articleId), visibleArticleCondition!))
          .limit(1)
      )[0];
      if (!article) return false;

      const dayStart = new Date(
        Date.UTC(
          instant.getUTCFullYear(),
          instant.getUTCMonth(),
          instant.getUTCDate(),
        ),
      );

      // STAT-01：去重检查与计数在同一事务内，避免并发首读双计。
      let counted = false;
      await client.transaction(async (transaction) => {
        const recent = await transaction
          .select({ id: articleReadEvents.id })
          .from(articleReadEvents)
          .where(
            and(
              eq(articleReadEvents.userId, userId),
              eq(articleReadEvents.articleId, articleId),
              gte(
                articleReadEvents.readAt,
                new Date(instant.getTime() - thirtyMinutesMs),
              ),
            ),
          )
          .limit(1);
        if (recent.length > 0) return;

        const sameDay = await transaction
          .select({ id: articleReadEvents.id })
          .from(articleReadEvents)
          .where(
            and(
              eq(articleReadEvents.userId, userId),
              eq(articleReadEvents.articleId, articleId),
              gte(articleReadEvents.readAt, dayStart),
              sql`${articleReadEvents.readAt} < ${new Date(
                dayStart.getTime() + dayMs,
              )}`,
            ),
          )
          .limit(1);

        await transaction.insert(articleReadEvents).values({
          id: randomUUID(),
          articleId,
          userId,
          readAt: instant,
        });
        await transaction
          .update(articles)
          .set({ readCount: sql`${articles.readCount} + 1` })
          .where(eq(articles.id, articleId));
        if (sameDay.length === 0) {
          await transaction
            .insert(articleDailyReach)
            .values({
              articleId,
              readDay: instant.toISOString().slice(0, 10),
              reachCount: 1,
            })
            .onConflictDoUpdate({
              target: [articleDailyReach.articleId, articleDailyReach.readDay],
              set: {
                reachCount: sql`${articleDailyReach.reachCount} + 1`,
              },
            });
        }
        counted = true;
      });
      return counted;
    },

    async recordTemplateDownload({
      templateVersionId,
      userId,
      instant = new Date(),
    }) {
      await client.transaction(async (transaction) => {
        await transaction.insert(templateDownloadEvents).values({
          id: randomUUID(),
          templateVersionId,
          userId,
          downloadedAt: instant,
        });
        await transaction
          .update(templateVersions)
          .set({ downloadCount: sql`${templateVersions.downloadCount} + 1` })
          .where(eq(templateVersions.id, templateVersionId));
      });
    },

    async reachStats(articleId, instant = new Date()) {
      async function distinctUsers(since: Date): Promise<number> {
        const row = (
          await client
            .select({
              count: sql<number>`count(distinct ${articleReadEvents.userId})`,
            })
            .from(articleReadEvents)
            .where(
              and(
                eq(articleReadEvents.articleId, articleId),
                gte(articleReadEvents.readAt, since),
              ),
            )
        )[0];
        return Number(row?.count ?? 0);
      }

      const [d7, d30, d90, eventAll, snapshot] = await Promise.all([
        distinctUsers(new Date(instant.getTime() - 7 * dayMs)),
        distinctUsers(new Date(instant.getTime() - 30 * dayMs)),
        distinctUsers(new Date(instant.getTime() - 90 * dayMs)),
        distinctUsers(new Date(0)),
        client
          .select({
            total: sql<number>`coalesce(sum(${articleDailyReach.reachCount}), 0)`,
          })
          .from(articleDailyReach)
          .where(eq(articleDailyReach.articleId, articleId)),
      ]);
      return {
        d7,
        d30,
        d90,
        all: eventAll + Number(snapshot[0]?.total ?? 0),
      };
    },

    async editorDashboard(requestingUserId, instant = new Date()) {
      await assertEditor(client, requestingUserId);
      const now = instant;

      const [
        hotArticles,
        highReachArticles,
        growingArticles,
        longUnreadArticles,
        searchDrivenOpens,
        noResultTerms,
        templateDownloads,
      ] = await Promise.all([
        client
          .select({
            stableId: articles.stableId,
            title: articles.title,
            readCount: articles.readCount,
          })
          .from(articles)
          .where(visibleArticleCondition!)
          .orderBy(desc(articles.readCount))
          .limit(10),
        client
          .select({
            stableId: articles.stableId,
            title: articles.title,
            value: sql<number>`count(distinct ${articleReadEvents.userId})`,
          })
          .from(articleReadEvents)
          .innerJoin(articles, eq(articleReadEvents.articleId, articles.id))
          .where(
            gte(articleReadEvents.readAt, new Date(now.getTime() - 30 * dayMs)),
          )
          .groupBy(articles.id)
          .orderBy(desc(sql`count(distinct ${articleReadEvents.userId})`))
          .limit(10),
        client
          .select({
            stableId: articles.stableId,
            title: articles.title,
            recentReads: sql<number>`count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
              now.getTime() - 7 * dayMs,
            )})`,
            previousReads: sql<number>`count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
              now.getTime() - 14 * dayMs,
            )} and ${articleReadEvents.readAt} < ${new Date(
              now.getTime() - 7 * dayMs,
            )})`,
          })
          .from(articleReadEvents)
          .innerJoin(articles, eq(articleReadEvents.articleId, articles.id))
          .groupBy(articles.id)
          .having(
            sql`count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
              now.getTime() - 7 * dayMs,
            )}) > 0 and count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
              now.getTime() - 14 * dayMs,
            )} and ${articleReadEvents.readAt} < ${new Date(
              now.getTime() - 7 * dayMs,
            )}) > 0`,
          )
          .orderBy(
            desc(
              sql`count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
                now.getTime() - 7 * dayMs,
              )}) - count(*) filter (where ${articleReadEvents.readAt} >= ${new Date(
                now.getTime() - 14 * dayMs,
              )} and ${articleReadEvents.readAt} < ${new Date(
                now.getTime() - 7 * dayMs,
              )})`,
            ),
          )
          .limit(10),
        client
          .select({
            stableId: articles.stableId,
            title: articles.title,
            publishedAt: articles.publishedAt,
          })
          .from(articles)
          .where(
            and(
              visibleArticleCondition!,
              sql`${articles.publishedAt} < ${new Date(
                now.getTime() - 90 * dayMs,
              )}`,
              sql`not exists (
                  select 1 from article_read_events unread_event
                  where unread_event.article_id = ${articles.id}
                    and unread_event.read_at >= ${new Date(
                      now.getTime() - 90 * dayMs,
                    )}
                )`,
            ),
          )
          .orderBy(desc(articles.publishedAt))
          .limit(10),
        client
          .select({
            stableId: articles.stableId,
            title: articles.title,
            value: sql<number>`count(*)`,
          })
          .from(articleReadEvents)
          .innerJoin(articles, eq(articleReadEvents.articleId, articles.id))
          .where(
            sql`exists (
                select 1 from search_events search_event
                where search_event.user_id = ${articleReadEvents.userId}
                  and search_event.created_at >= ${articleReadEvents.readAt} - interval '30 minutes'
                  and search_event.created_at <= ${articleReadEvents.readAt}
              )`,
          )
          .groupBy(articles.id)
          .orderBy(desc(sql`count(*)`))
          .limit(10),
        client
          .select({
            query: searchAggregates.query,
            count: searchAggregates.searchCount,
            lastSearchedAt: searchAggregates.lastSearchedAt,
          })
          .from(searchAggregates)
          .where(eq(searchAggregates.hasResults, false))
          .orderBy(desc(searchAggregates.searchCount))
          .limit(20),
        client
          .select({
            stableId: templates.stableId,
            name: templates.name,
            downloadCount: templateVersions.downloadCount,
            downloadUsers: sql<number>`(
                select count(distinct download_event.user_id)
                from template_download_events download_event
                where download_event.template_version_id = ${templateVersions.id}
              )`,
          })
          .from(templates)
          .innerJoin(
            templateVersions,
            and(
              eq(templateVersions.templateId, templates.id),
              eq(templateVersions.status, "active"),
            ),
          )
          .where(eq(templates.status, "published"))
          .orderBy(desc(templateVersions.downloadCount))
          .limit(10),
      ]);

      return {
        hotArticles,
        highReachArticles: highReachArticles.map((row) => ({
          ...row,
          value: Number(row.value),
        })),
        growingArticles: growingArticles.map((row) => ({
          ...row,
          recentReads: Number(row.recentReads),
          previousReads: Number(row.previousReads),
        })),
        longUnreadArticles: longUnreadArticles.map((row) => ({
          ...row,
          publishedAt: row.publishedAt!,
        })),
        searchDrivenOpens: searchDrivenOpens.map((row) => ({
          ...row,
          value: Number(row.value),
        })),
        noResultTerms,
        templateDownloads: templateDownloads.map((row) => ({
          ...row,
          downloadCount: row.downloadCount,
          downloadUsers: Number(row.downloadUsers),
        })),
      };
    },

    async listIdentitySearchDetail(requestingUserId, limit = 50) {
      await assertAdministrator(client, requestingUserId);
      const rows = await client
        .select({
          query: searchEvents.query,
          userName: sql<string>`coalesce(${users.displayName}, ${users.username})`,
          hasResults: searchEvents.hasResults,
          note: searchEvents.note,
          createdAt: searchEvents.createdAt,
        })
        .from(searchEvents)
        .leftJoin(users, eq(searchEvents.userId, users.id))
        .where(gte(searchEvents.createdAt, new Date(Date.now() - 90 * dayMs)))
        .orderBy(desc(searchEvents.createdAt))
        .limit(limit);
      return rows.map((row) => ({ ...row }));
    },

    async listIdentityReachDetail(requestingUserId, limit = 50) {
      await assertAdministrator(client, requestingUserId);
      const rows = await client
        .select({
          articleStableId: articles.stableId,
          articleTitle: articles.title,
          userName: sql<string>`coalesce(${users.displayName}, ${users.username})`,
          readAt: articleReadEvents.readAt,
        })
        .from(articleReadEvents)
        .innerJoin(articles, eq(articleReadEvents.articleId, articles.id))
        .leftJoin(users, eq(articleReadEvents.userId, users.id))
        .where(gte(articleReadEvents.readAt, new Date(Date.now() - 90 * dayMs)))
        .orderBy(desc(articleReadEvents.readAt))
        .limit(limit);
      return rows.map((row) => ({ ...row }));
    },

    async purgeIdentityDetails(requestingUserId, before) {
      await assertAdministrator(client, requestingUserId);
      let purgedReadEvents = 0;
      let purgedSearchEvents = 0;
      let purgedDownloadEvents = 0;

      await client.transaction(async (transaction) => {
        const readDeleted = await transaction
          .delete(articleReadEvents)
          .where(sql`${articleReadEvents.readAt} < ${before}`)
          .returning({ id: articleReadEvents.id });
        const searchDeleted = await transaction
          .delete(searchEvents)
          .where(sql`${searchEvents.createdAt} < ${before}`)
          .returning({ id: searchEvents.id });
        const downloadDeleted = await transaction
          .delete(templateDownloadEvents)
          .where(sql`${templateDownloadEvents.downloadedAt} < ${before}`)
          .returning({ id: templateDownloadEvents.id });

        purgedReadEvents = readDeleted.length;
        purgedSearchEvents = searchDeleted.length;
        purgedDownloadEvents = downloadDeleted.length;
      });

      return {
        purgedReadEvents,
        purgedSearchEvents,
        purgedDownloadEvents,
      };
    },

    async exportAggregateStats(requestingUserId) {
      await assertEditor(client, requestingUserId);
      const [articleRows, templateRows] = await Promise.all([
        client
          .select({
            stableId: articles.stableId,
            name: articles.title,
            readCount: articles.readCount,
            reach30: sql<number>`(
              select count(distinct reach_event.user_id)
              from article_read_events reach_event
              where reach_event.article_id = ${articles.id}
                and reach_event.read_at >= ${new Date(Date.now() - 30 * dayMs)}
            )`,
          })
          .from(articles)
          .where(visibleArticleCondition!)
          .orderBy(desc(articles.readCount)),
        client
          .select({
            stableId: templates.stableId,
            name: templates.name,
            downloadCount: templateVersions.downloadCount,
            downloadUsers: sql<number>`(
              select count(distinct download_event.user_id)
              from template_download_events download_event
              where download_event.template_version_id = ${templateVersions.id}
            )`,
          })
          .from(templates)
          .innerJoin(
            templateVersions,
            and(
              eq(templateVersions.templateId, templates.id),
              eq(templateVersions.status, "active"),
            ),
          )
          .where(eq(templates.status, "published"))
          .orderBy(desc(templateVersions.downloadCount)),
      ]);

      const lines = [
        "类型,稳定标识,名称,阅读次数,触达人数(30天),下载次数,下载人数",
        ...articleRows.map((row) =>
          [
            "文章",
            row.stableId,
            row.name,
            row.readCount,
            Number(row.reach30),
            0,
            0,
          ].join(","),
        ),
        ...templateRows.map((row) =>
          [
            "模板",
            row.stableId,
            row.name,
            0,
            0,
            row.downloadCount,
            Number(row.downloadUsers),
          ].join(","),
        ),
      ];
      return lines.join("\n");
    },
  };
}
