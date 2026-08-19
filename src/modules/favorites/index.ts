import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { Sql } from "postgres";

import { createDatabaseClient } from "@/db/client";
import { articleFavorites, articles, sections, topics } from "@/db/schema";

export type FavoriteArticle = {
  stableId: string;
  title: string;
  summary: string;
  topicName: string;
  topicStableId: string;
  sectionName: string;
  updatedAt: Date;
};

export type FavoritesService = {
  listFavorites(userId: string): Promise<FavoriteArticle[]>;
  isFavorite(userId: string, articleId: string): Promise<boolean>;
  toggleFavorite(
    userId: string,
    articleId: string,
  ): Promise<{ favorite: boolean }>;
};

const visibleArticleCondition = or(
  eq(articles.status, "published"),
  and(eq(articles.status, "draft"), sql`${articles.publishedAt} is not null`),
);

export function createFavoritesService(
  database: PGlite | Sql,
): FavoritesService {
  const client = createDatabaseClient(database);

  return {
    async listFavorites(userId) {
      const rows = await client
        .select({
          stableId: articles.stableId,
          title: articles.title,
          summary: articles.summary,
          topicName: topics.name,
          topicStableId: topics.stableId,
          sectionName: sections.name,
          updatedAt: articles.updatedAt,
          createdAt: articleFavorites.createdAt,
        })
        .from(articleFavorites)
        .innerJoin(articles, eq(articleFavorites.articleId, articles.id))
        .innerJoin(topics, eq(articles.primaryTopicId, topics.id))
        .innerJoin(sections, eq(topics.sectionId, sections.id))
        .where(
          and(eq(articleFavorites.userId, userId), visibleArticleCondition!),
        )
        .orderBy(desc(articleFavorites.createdAt), desc(articles.updatedAt));
      return rows.map((row) => ({
        stableId: row.stableId,
        title: row.title,
        summary: row.summary,
        topicName: row.topicName,
        topicStableId: row.topicStableId,
        sectionName: row.sectionName,
        updatedAt: row.updatedAt,
      }));
    },

    async isFavorite(userId, articleId) {
      const rows = await client
        .select({ id: articleFavorites.id })
        .from(articleFavorites)
        .where(
          and(
            eq(articleFavorites.userId, userId),
            eq(articleFavorites.articleId, articleId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },

    async toggleFavorite(userId, articleId) {
      const article = (
        await client
          .select({ id: articles.id })
          .from(articles)
          .where(and(eq(articles.id, articleId), visibleArticleCondition!))
          .limit(1)
      )[0];
      if (!article) {
        throw new Error("Article not available.");
      }

      const existing = await client
        .select({ id: articleFavorites.id })
        .from(articleFavorites)
        .where(
          and(
            eq(articleFavorites.userId, userId),
            eq(articleFavorites.articleId, articleId),
          ),
        )
        .limit(1);

      if (existing[0]) {
        await client
          .delete(articleFavorites)
          .where(eq(articleFavorites.id, existing[0].id));
        return { favorite: false };
      }

      await client.insert(articleFavorites).values({
        id: randomUUID(),
        articleId,
        userId,
        createdAt: new Date(),
      });
      return { favorite: true };
    },
  };
}
